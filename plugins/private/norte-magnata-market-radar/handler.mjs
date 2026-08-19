const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const MAX_QUERIES_PER_LANE = 12;
const YOUTUBE_KEY_SECRET = "YOUTUBE_DATA_API_KEYS";

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
  if (["quotaExceeded", "rateLimitExceeded", "userRateLimitExceeded"].includes(reason)) {
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
  const usage = { searchCalls: 0, detailsCalls: 0, rotations: 0 };

  async function request(path, params) {
    while (true) {
      const url = new URL(`${YOUTUBE_API}${path}`);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
      url.searchParams.set("key", keys[keyIndex]);
      if (path === "/search") usage.searchCalls += 1;
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
        throw Object.assign(new Error("Não foi possível alcançar a YouTube Data API."), {
          code: "UPSTREAM_UNAVAILABLE",
          retryable: true,
        });
      }
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      const error = apiError(payload);
      if (error.quota) {
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
  const value = await services.getSecret(YOUTUBE_KEY_SECRET);
  return [
    ...new Set(
      text(value)
        .split(/[\r\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizeVideo(item, query, lane, retrievedAt) {
  const statistics = item.statistics ?? {};
  const snippet = item.snippet ?? {};
  const duration = durationSeconds(item.contentDetails?.duration);
  const views = number(statistics.viewCount);
  const comments = number(statistics.commentCount);
  const publishedAt = text(snippet.publishedAt) || retrievedAt;
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
    research_lane: lane,
    source_query: query,
    retrieved_at: retrievedAt,
  };
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
  const maxResults = integer(request.configuration?.max_results_per_query, 8);
  const minimumDuration = integer(request.configuration?.min_duration_seconds, 180);
  const simulate = request.configuration?.simulate === true;
  if (publishedWithinDays < 1 || publishedWithinDays > 365)
    return invalidConfiguration("published_within_days deve estar entre 1 e 365.");
  if (maxResults < 1 || maxResults > 20)
    return invalidConfiguration("max_results_per_query deve estar entre 1 e 20.");
  if (minimumDuration < 30 || minimumDuration > 7200)
    return invalidConfiguration("min_duration_seconds deve estar entre 30 e 7200.");

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
        maxResults,
      });
      for (const item of Array.isArray(search.items) ? search.items : []) {
        const id = text(item?.id?.videoId);
        if (id && !found.has(id)) found.set(id, plan);
      }
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

    const details = await client.request("/videos", {
      part: "snippet,statistics,contentDetails",
      id: ids.join(","),
      maxResults: 50,
    });
    const snapshot = (Array.isArray(details.items) ? details.items : [])
      .map((item) => {
        const plan = found.get(text(item.id));
        return plan ? normalizeVideo(item, plan.query, plan.lane, retrievedAt) : undefined;
      })
      .filter((item) => item && item.duration_seconds >= minimumDuration)
      .sort(
        (left, right) =>
          right.views_per_day - left.views_per_day || right.view_count - left.view_count,
      );

    return {
      status: "success",
      values: {
        market_snapshot: snapshot,
        research_summary: [
          `Coleta concluída em ${retrievedAt}.`,
          `Consultas: ${plannedQueries.length}; chamadas de busca: ${plannedQueries.length}; chamada de detalhes: 1.`,
          `Janela: ${publishedWithinDays} dias; duração mínima: ${minimumDuration}s.`,
          `Vídeos únicos encontrados: ${ids.length}; aprovados no filtro local: ${snapshot.length}.`,
          "Este snapshot é factual: não cria nem aprova tema, título, CTA ou roteiro.",
        ].join("\n"),
      },
      usage: {
        provider: "YouTube Data API",
        inputUnits: client.usage.searchCalls * 100 + client.usage.detailsCalls,
        totalUnits: client.usage.searchCalls * 100 + client.usage.detailsCalls,
        unit: "estimated quota units",
      },
      logs: [
        `youtube_search_calls=${client.usage.searchCalls}`,
        `youtube_video_details_calls=${client.usage.detailsCalls}`,
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
