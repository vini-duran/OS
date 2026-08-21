const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const MAX_QUERIES_PER_LANE = 20;
const MAX_RESULTS_PER_QUERY = 50;
const MAX_CANDIDATES = 1_000;
const MAX_DEEP_REVIEWS = 100;
const MAX_CHANNEL_BENCHMARKS = 20;
const YOUTUBE_KEY_SECRETS = [
  "YOUTUBE_API_KEY_PROJECT_01",
  "YOUTUBE_API_KEY_PROJECT_02",
  "YOUTUBE_API_KEY_PROJECT_03",
  "YOUTUBE_API_KEY_PROJECT_04",
  "YOUTUBE_API_KEY_PROJECT_05",
  "YOUTUBE_API_KEY_PROJECT_06",
  "YOUTUBE_API_KEY_PROJECT_07",
  "YOUTUBE_API_KEY_PROJECT_08",
];
const LEGACY_YOUTUBE_KEY_SECRET = "YOUTUBE_DATA_API_KEYS";

const RECORD_FIELDS = [
  ["source", "Fonte", "text"],
  ["video_id", "ID do vídeo", "text"],
  ["video_url", "Vídeo", "url"],
  ["channel_id", "ID do canal", "text"],
  ["channel_title", "Canal", "text"],
  ["title", "Título observado", "text"],
  ["published_at", "Publicado em", "datetime"],
  ["duration_seconds", "Duração (s)", "number"],
  ["view_count", "Visualizações", "number"],
  ["like_count", "Curtidas", "number"],
  ["comment_count", "Comentários", "number"],
  ["views_per_day", "Views/dia", "number"],
  ["comments_per_1k_views", "Comentários por mil views", "number"],
  ["subscriber_count", "Inscritos do canal", "number"],
  ["views_per_subscriber", "Views por inscrito", "number"],
  ["channel_median_views_per_day", "Mediana do canal (views/dia)", "number"],
  ["outperformance_vs_channel", "Desempenho vs. canal", "number"],
  ["comment_signal_score", "Sinal nos comentários (0-1)", "number"],
  ["comment_samples", "Amostras de comentários", "textarea"],
  ["thumbnail_url", "Thumbnail observada", "url"],
  ["hook_pattern", "Padrão de gancho observado", "text"],
  ["market_score", "Nota de mercado (0-5)", "number"],
  ["score_reason", "Justificativa da nota", "textarea"],
  ["content_language", "Idioma declarado", "text"],
  ["language_status", "Aderência de idioma", "select", ["preferred", "unknown"]],
  ["query_term_matches", "Termos da consulta no conteúdo", "number"],
  ["research_lane", "Linha de pesquisa", "select", ["core", "niche_bending"]],
  ["source_query", "Consulta de origem", "text"],
  ["retrieved_at", "Coletado em", "datetime"],
];

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function integer(value, fallback) {
  return Number.isInteger(value) ? value : fallback;
}

function queries(value) {
  return [
    ...new Set(
      text(value)
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, MAX_QUERIES_PER_LANE);
}

function phrases(value) {
  return [
    ...new Set(
      text(value)
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizedWords(value) {
  return new Set(
    text(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(
        (item) =>
          item.length >= 4 &&
          !["como", "para", "mesmo", "sem", "ter", "sua", "suas", "vicio"].includes(item),
      ),
  );
}

function durationSeconds(isoDuration) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(text(isoDuration));
  if (!match) return 0;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function fixed(value, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function hookPattern(title) {
  return text(title)
    .replace(/\d+/g, "[n]")
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function commentSignal(comments) {
  const value = comments.join(" ").toLowerCase();
  if (!value) return 0;
  const signals = ["eu", "minha", "meu", "preciso", "comecei", "vou", "ajudou", "funcionou", "verdade", "obrigado", "parte 2", "continua"];
  return fixed(Math.min(1, signals.filter((signal) => value.includes(signal)).length / 5), 2);
}

function scoreCandidate(item) {
  const velocity = Math.min(1.5, Math.log10(Math.max(1, item.views_per_day)) / 4 * 1.5);
  const breakout = Math.min(1.5, Math.log10(Math.max(1, item.views_per_subscriber || 1)) / 2 * 0.75 + Math.min(0.75, (item.outperformance_vs_channel || 0) / 4));
  const engagement = Math.min(1, item.comments_per_1k_views / 8);
  const comments = Math.min(1, item.comment_signal_score || 0);
  const score = Math.round(Math.max(0, Math.min(5, velocity + breakout + engagement + comments)) * 2) / 2;
  return {
    market_score: score,
    score_reason: `Velocidade ${fixed(velocity, 1)}/1,5; desempenho relativo ${fixed(breakout, 1)}/1,5; engajamento ${fixed(engagement, 1)}/1; sinal em comentários ${fixed(comments, 1)}/1. Heurística factual, não mede retenção nem vendas.`,
  };
}

function invalidConfiguration(message) {
  return { status: "error", code: "INVALID_CONFIGURATION", message, retryable: false };
}

function outputFields() {
  return RECORD_FIELDS.map(([key, label, type, options]) => ({
    id: `market-snapshot-${key}`,
    key,
    label,
    type,
    required: true,
    ...(options ? { options } : {}),
  }));
}

function ensureOutputContract(request) {
  const snapshot = request.outputContract?.find((item) => item.portKey === "market_snapshot");
  const summary = request.outputContract?.find((item) => item.portKey === "research_summary");
  if (!snapshot || !summary || snapshot.type !== "records" || summary.type !== "textarea") {
    return "O bloco deve mapear market_snapshot (records) e research_summary (textarea).";
  }
  return undefined;
}

function apiError(payload) {
  const reason = payload?.error?.errors?.[0]?.reason ?? payload?.error?.status ?? "";
  if (reason === "commentsDisabled") {
    return {
      code: "COMMENTS_DISABLED",
      retryable: false,
      message: "Os comentários deste vídeo estão desativados.",
    };
  }
  if (["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded"].includes(reason)) {
    return {
      code: "RATE_LIMIT",
      retryable: true,
      message: "A quota temporária da YouTube Data API foi atingida.",
      quota: true,
    };
  }
  if (["keyInvalid", "forbidden", "accessNotConfigured"].includes(reason)) {
    return {
      code: "AUTHENTICATION_FAILED",
      retryable: false,
      message: "A chave da YouTube Data API foi recusada ou não está habilitada.",
    };
  }
  return {
    code: "UPSTREAM_UNAVAILABLE",
    retryable: true,
    message: "A YouTube Data API não respondeu à pesquisa.",
  };
}

function makeYouTubeClient(keys, signal) {
  let keyIndex = 0;
  const exhausted = new Set();
  const usage = { searchCalls: 0, detailsCalls: 0, channelCalls: 0, commentCalls: 0, rotations: 0 };

  async function request(path, params) {
    let transientAttempts = 0;
    while (true) {
      const url = new URL(`${YOUTUBE_API}${path}`);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
      url.searchParams.set("key", keys[keyIndex]);
      if (path === "/search") usage.searchCalls += 1;
      else if (path === "/channels") usage.channelCalls += 1;
      else if (path === "/commentThreads") usage.commentCalls += 1;
      else usage.detailsCalls += 1;
      let response;
      try {
        response = await fetch(url, { signal });
      } catch (error) {
        if (error?.name === "AbortError")
          throw Object.assign(new Error("Coleta cancelada."), {
            code: "CANCELLED",
            retryable: false,
          });
        if (transientAttempts++ < 2) {
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** transientAttempts));
          continue;
        }
        throw Object.assign(new Error("Não foi possível alcançar a YouTube Data API."), {
          code: "UPSTREAM_UNAVAILABLE",
          retryable: true,
        });
      }
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      const error = apiError(payload);
      const quotaResponse =
        error.quota ||
        ([403, 429].includes(response.status) && /quota|dailylimit|ratelimit/.test(JSON.stringify(payload).toLowerCase()));
      if (quotaResponse) {
        exhausted.add(keyIndex);
        const nextIndex = keys.findIndex((_, index) => !exhausted.has(index));
        if (nextIndex >= 0) {
          keyIndex = nextIndex;
          usage.rotations += 1;
          continue;
        }
        throw Object.assign(
          new Error("Todas as chaves YouTube configuradas sinalizaram quota esgotada."),
          { code: "RATE_LIMIT", retryable: true },
        );
      }
      throw Object.assign(new Error(error.message), error);
    }
  }
  return { request, usage };
}

async function configuredKeys(services) {
  const values = await Promise.all([
    ...YOUTUBE_KEY_SECRETS.map((name) => services.getSecret(name)),
    services.getSecret(LEGACY_YOUTUBE_KEY_SECRET),
  ]);
  return [
    ...new Set(
      values.flatMap((value) => text(value).split(/[\r\n,]+/).map((item) => item.trim())).filter(Boolean),
    ),
  ];
}

function normalizeVideo(item, query, lane, retrievedAt, preferredLanguage) {
  const statistics = item.statistics ?? {};
  const snippet = item.snippet ?? {};
  const duration = durationSeconds(item.contentDetails?.duration);
  const views = number(statistics.viewCount);
  const comments = number(statistics.commentCount);
  const publishedAt = text(snippet.publishedAt) || retrievedAt;
  const contentLanguage = text(
    snippet.defaultAudioLanguage || snippet.defaultLanguage,
  ).toLowerCase();
  const languageStatus =
    !contentLanguage || contentLanguage.startsWith(preferredLanguage)
      ? contentLanguage
        ? "preferred"
        : "unknown"
      : "mismatch";
  const queryTerms = normalizedWords(query);
  const contentTerms = normalizedWords(`${snippet.title ?? ""} ${snippet.description ?? ""}`);
  const queryTermMatches = [...queryTerms].filter((term) => contentTerms.has(term)).length;
  const liveDays = Math.max(1, (Date.parse(retrievedAt) - Date.parse(publishedAt)) / 86_400_000);
  return {
    source: "youtube_data_api",
    video_id: text(item.id),
    video_url: `https://www.youtube.com/watch?v=${encodeURIComponent(text(item.id))}`,
    channel_id: text(snippet.channelId),
    channel_title: text(snippet.channelTitle),
    title: text(snippet.title),
    published_at: publishedAt,
    duration_seconds: duration,
    view_count: views,
    like_count: number(statistics.likeCount),
    comment_count: comments,
    views_per_day: fixed(views / liveDays),
    comments_per_1k_views: fixed((comments / Math.max(views, 1)) * 1000),
    subscriber_count: 0,
    views_per_subscriber: 0,
    channel_median_views_per_day: 0,
    outperformance_vs_channel: 0,
    comment_signal_score: 0,
    comment_samples: "",
    thumbnail_url: text(snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url),
    hook_pattern: hookPattern(snippet.title),
    market_score: 0,
    score_reason: "Ainda não classificado.",
    content_language: contentLanguage || "unknown",
    language_status: languageStatus,
    query_term_matches: queryTermMatches,
    research_lane: lane,
    source_query: query,
    retrieved_at: retrievedAt,
  };
}

function acceptedByLocalFit(
  item,
  { minimumViewsPerDay, minimumQueryTermMatches, excludedTitleTerms },
) {
  if (item.language_status === "mismatch") return false;
  if (item.views_per_day < minimumViewsPerDay) return false;
  if (item.query_term_matches < minimumQueryTermMatches) return false;
  const title = text(item.title)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return !excludedTitleTerms.some((phrase) => title.includes(phrase));
}

export async function execute(request, services) {
  if (request.invocation?.mode !== "start") {
    return invalidConfiguration("Esta capacidade é imediata e não possui job assíncrono.");
  }
  if (services.signal?.aborted) {
    return { status: "error", code: "CANCELLED", message: "Coleta cancelada.", retryable: false };
  }
  const contractError = ensureOutputContract(request);
  if (contractError) return invalidConfiguration(contractError);

  const coreQueries = queries(request.configuration?.core_queries);
  const bridgeQueries = queries(request.configuration?.niche_bending_queries);
  if (!coreQueries.length)
    return invalidConfiguration("Informe ao menos uma consulta central em core_queries.");

  const publishedWithinDays = integer(request.configuration?.published_within_days, 60);
  const maxResults = integer(request.configuration?.max_results_per_query, MAX_RESULTS_PER_QUERY);
  const candidateTarget = integer(request.configuration?.candidate_target, MAX_CANDIDATES);
  const deepReviewLimit = integer(request.configuration?.deep_review_limit, MAX_DEEP_REVIEWS);
  const topLimit = integer(request.configuration?.top_limit, 10);
  const minimumBendingTop = integer(request.configuration?.minimum_niche_bending_top, 6);
  const minimumDuration = integer(request.configuration?.min_duration_seconds, 180);
  const regionCode = text(request.configuration?.region_code || "BR").toUpperCase();
  const preferredLanguage = text(request.configuration?.preferred_language || "pt").toLowerCase();
  const minimumViewsPerDay = Number.isFinite(request.configuration?.minimum_views_per_day)
    ? number(request.configuration.minimum_views_per_day)
    : 30;
  const minimumQueryTermMatches = integer(request.configuration?.minimum_query_term_matches, 1);
  const excludedTitleTerms = phrases(request.configuration?.excluded_title_terms).map((phrase) =>
    phrase
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase(),
  );
  const simulate = request.configuration?.simulate === true;
  if (publishedWithinDays < 1 || publishedWithinDays > 365)
    return invalidConfiguration("published_within_days deve estar entre 1 e 365.");
  if (maxResults < 1 || maxResults > MAX_RESULTS_PER_QUERY)
    return invalidConfiguration(`max_results_per_query deve estar entre 1 e ${MAX_RESULTS_PER_QUERY}.`);
  if (candidateTarget < 50 || candidateTarget > MAX_CANDIDATES)
    return invalidConfiguration(`candidate_target deve estar entre 50 e ${MAX_CANDIDATES}.`);
  if (deepReviewLimit < 10 || deepReviewLimit > MAX_DEEP_REVIEWS)
    return invalidConfiguration(`deep_review_limit deve estar entre 10 e ${MAX_DEEP_REVIEWS}.`);
  if (topLimit < 1 || topLimit > 20)
    return invalidConfiguration("top_limit deve estar entre 1 e 20.");
  if (minimumBendingTop < 0 || minimumBendingTop > topLimit)
    return invalidConfiguration("minimum_niche_bending_top deve estar entre 0 e top_limit.");
  if (minimumDuration < 30 || minimumDuration > 7200)
    return invalidConfiguration("min_duration_seconds deve estar entre 30 e 7200.");
  if (!/^[A-Z]{2}$/.test(regionCode))
    return invalidConfiguration("region_code deve ter duas letras maiúsculas.");
  if (!/^[a-z]{2}$/.test(preferredLanguage))
    return invalidConfiguration("preferred_language deve ter duas letras minúsculas.");
  if (minimumQueryTermMatches < 0 || minimumQueryTermMatches > 10)
    return invalidConfiguration("minimum_query_term_matches deve estar entre 0 e 10.");

  if (simulate) {
    return {
      status: "success",
      values: {
        market_snapshot: [],
        research_summary:
          "Simulação concluída: contrato e parâmetros validados; nenhuma consulta externa foi feita e nenhum dado de mercado foi produzido.",
      },
      logs: ["simulation=true", "youtube_search_calls=0", "youtube_video_details_calls=0"],
    };
  }

  const keys = await configuredKeys(services);
  if (!keys.length) {
    return {
      status: "error",
      code: "MISSING_SECRET",
      message:
        "Conecte ao menos uma chave em YOUTUBE_DATA_API_KEYS na Central de Plugins antes de iniciar a coleta.",
      retryable: false,
    };
  }

  const retrievedAt = new Date().toISOString();
  const publishedAfter = new Date(Date.now() - publishedWithinDays * 86_400_000).toISOString();
  const plannedQueries = [
    ...coreQueries.map((query) => ({ query, lane: "core" })),
    ...bridgeQueries.map((query) => ({ query, lane: "niche_bending" })),
  ];
  const found = new Map();
  const client = makeYouTubeClient(keys, services.signal);

  try {
    for (const plan of plannedQueries) {
      if (services.signal?.aborted) {
        return {
          status: "error",
          code: "CANCELLED",
          message: "Coleta cancelada.",
          retryable: false,
        };
      }
      const search = await client.request("/search", {
        part: "snippet",
        q: plan.query,
        type: "video",
        order: "viewCount",
        publishedAfter,
        regionCode,
        relevanceLanguage: preferredLanguage,
        maxResults,
      });
      for (const item of Array.isArray(search.items) ? search.items : []) {
        const id = text(item?.id?.videoId);
        if (id && !found.has(id)) found.set(id, plan);
      }
      if (found.size >= candidateTarget) break;
    }

    const ids = [...found.keys()];
    if (!ids.length) {
      return {
        status: "success",
        values: {
          market_snapshot: [],
          research_summary: `Coleta concluída em ${retrievedAt}. Nenhum vídeo público foi encontrado para ${plannedQueries.length} consulta(s) na janela de ${publishedWithinDays} dias.`,
        },
        usage: {
          provider: "YouTube Data API",
          inputUnits: client.usage.searchCalls * 100,
          totalUnits: client.usage.searchCalls * 100,
          unit: "estimated quota units",
        },
        logs: [
          `youtube_search_calls=${client.usage.searchCalls}`,
          "youtube_video_details_calls=0",
          `quota_rotations=${client.usage.rotations}`,
          "records=0",
        ],
      };
    }

    const detailItems = [];
    for (const group of chunks(ids, 50)) {
      const details = await client.request("/videos", {
        part: "snippet,statistics,contentDetails",
        id: group.join(","),
        maxResults: 50,
      });
      detailItems.push(...(Array.isArray(details.items) ? details.items : []));
    }
    const normalized = detailItems
      .map((item) => {
        const plan = found.get(text(item.id));
        return plan
          ? normalizeVideo(item, plan.query, plan.lane, retrievedAt, preferredLanguage)
          : undefined;
      })
      .filter((item) => item && item.duration_seconds >= minimumDuration);
    const eligible = normalized
      .filter((item) =>
        acceptedByLocalFit(item, {
          minimumViewsPerDay,
          minimumQueryTermMatches,
          excludedTitleTerms,
        }),
      )
      .sort((left, right) => right.views_per_day - left.views_per_day || right.view_count - left.view_count);

    const channelIds = [...new Set(eligible.map((item) => item.channel_id).filter(Boolean))];
    const channelSubscribers = new Map();
    for (const group of chunks(channelIds, 50)) {
      const channels = await client.request("/channels", { part: "statistics", id: group.join(","), maxResults: 50 });
      for (const channel of Array.isArray(channels.items) ? channels.items : []) {
        channelSubscribers.set(text(channel.id), number(channel.statistics?.subscriberCount));
      }
    }
    for (const item of eligible) {
      item.subscriber_count = channelSubscribers.get(item.channel_id) || 0;
      item.views_per_subscriber = item.subscriber_count
        ? fixed(item.view_count / item.subscriber_count)
        : 0;
    }

    const deepReview = eligible
      .slice()
      .sort((left, right) => right.views_per_day - left.views_per_day || right.views_per_subscriber - left.views_per_subscriber)
      .slice(0, deepReviewLimit);
    for (const item of deepReview) {
      let thread = { items: [] };
      try {
        thread = await client.request("/commentThreads", { part: "snippet", videoId: item.video_id, order: "relevance", maxResults: 10, textFormat: "plainText" });
      } catch (error) {
        if (error?.code !== "COMMENTS_DISABLED") throw error;
      }
      const samples = (Array.isArray(thread.items) ? thread.items : [])
        .map((entry) => text(entry.snippet?.topLevelComment?.snippet?.textDisplay))
        .filter(Boolean)
        .slice(0, 3);
      item.comment_samples = samples.join("\n---\n");
      item.comment_signal_score = commentSignal(samples);
    }

    const benchmark = deepReview.slice(0, MAX_CHANNEL_BENCHMARKS);
    for (const item of benchmark) {
      const recent = await client.request("/search", { part: "snippet", channelId: item.channel_id, type: "video", order: "date", maxResults: 5 });
      const recentIds = (Array.isArray(recent.items) ? recent.items : []).map((entry) => text(entry.id?.videoId)).filter(Boolean);
      if (!recentIds.length) continue;
      const videos = await client.request("/videos", { part: "snippet,statistics", id: recentIds.join(","), maxResults: 50 });
      const performance = (Array.isArray(videos.items) ? videos.items : []).map((video) => {
        const published = text(video.snippet?.publishedAt) || retrievedAt;
        return number(video.statistics?.viewCount) / Math.max(1, (Date.parse(retrievedAt) - Date.parse(published)) / 86_400_000);
      });
      item.channel_median_views_per_day = fixed(median(performance));
      item.outperformance_vs_channel = fixed(item.views_per_day / Math.max(1, item.channel_median_views_per_day));
    }

    for (const item of deepReview) Object.assign(item, scoreCandidate(item));
    const ranked = deepReview.sort((left, right) => right.market_score - left.market_score || right.views_per_day - left.views_per_day);
    const bending = ranked.filter((item) => item.research_lane === "niche_bending").slice(0, minimumBendingTop);
    const snapshot = [...bending, ...ranked.filter((item) => !bending.includes(item))].slice(0, topLimit);

    return {
      status: "success",
      values: {
        market_snapshot: snapshot,
        research_summary: [
          `Coleta concluída em ${retrievedAt}.`,
          `Consultas executadas: ${client.usage.searchCalls}; alvo de candidatos: ${candidateTarget}; máximo por consulta: ${maxResults}.`,
          `Região: ${regionCode}; idioma preferencial: ${preferredLanguage}; janela: ${publishedWithinDays} dias.`,
          `Duração mínima: ${minimumDuration}s; velocidade mínima: ${minimumViewsPerDay} views/dia; termos mínimos: ${minimumQueryTermMatches}.`,
          `Vídeos únicos encontrados: ${ids.length}; após duração: ${normalized.length}; aprovados localmente: ${eligible.length}; revisão aprofundada: ${deepReview.length}; Top ${snapshot.length}.`,
          `O Top ${snapshot.length} reserva até ${minimumBendingTop} referências de niche-bending quando elas passarem pelo filtro. A nota 0–5 em saltos de 0,5 é uma heurística explicável; não mede retenção, qualidade visual, veracidade nem conversão.`,
          "Este snapshot é factual: não cria nem aprova tema, título, CTA ou roteiro.",
        ].join("\n"),
      },
      usage: {
        provider: "YouTube Data API",
        inputUnits: client.usage.searchCalls * 100 + client.usage.detailsCalls + client.usage.channelCalls + client.usage.commentCalls,
        totalUnits: client.usage.searchCalls * 100 + client.usage.detailsCalls + client.usage.channelCalls + client.usage.commentCalls,
        unit: "estimated quota units",
      },
      logs: [
        `youtube_search_calls=${client.usage.searchCalls}`,
        `youtube_video_details_calls=${client.usage.detailsCalls}`,
        `youtube_channel_calls=${client.usage.channelCalls}`,
        `youtube_comment_calls=${client.usage.commentCalls}`,
        `quota_rotations=${client.usage.rotations}`,
        `records=${snapshot.length}`,
      ],
    };
  } catch (error) {
    return {
      status: "error",
      code: error?.code ?? "UPSTREAM_UNAVAILABLE",
      message: error instanceof Error ? error.message : "A coleta do YouTube falhou.",
      retryable: error?.retryable ?? true,
    };
  }
}

export { outputFields };
