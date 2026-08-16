import type {
  ChannelResearchConfig,
  ChannelResearchQuery,
  RecordFieldDefinition,
} from "@/lib/domain";
import type { PluginFieldContract, PluginInputContract } from "@/lib/plugin-contract";

export const DAILY_RESEARCH_PLUGIN_ID = "com.spanish.research-youtube";
export const DAILY_RESEARCH_CAPABILITY_ID = "daily-research-youtube";

export const DAILY_RESEARCH_VIDEO_FIELDS: RecordFieldDefinition[] = [
  ["video_id", "ID do vídeo", "video_id", "text"],
  ["video_url", "URL do vídeo", "video_url", "url"],
  ["title", "Título", "title", "text"],
  ["channel_title", "Canal", "channel_title", "text"],
  ["channel_id", "ID do canal", "channel_id", "text"],
  ["published_at", "Publicado em", "published_at", "datetime"],
  ["duration_seconds", "Duração (s)", "duration_seconds", "number"],
  ["view_count", "Visualizações", "view_count", "number"],
  ["like_count", "Likes", "like_count", "number"],
  ["comment_count", "Comentários", "comment_count", "number"],
  ["subscriber_count", "Inscritos", "subscriber_count", "number"],
  ["subscriber_count_status", "Status de inscritos", "subscriber_count_status", "text"],
  ["comments_status", "Status dos comentários", "comments_status", "text"],
  ["comments_evidence", "Amostra de comentários (JSON)", "comments_evidence", "textarea"],
  ["search_query", "Consulta", "search_query", "text"],
  ["retrieved_at", "Coletado em", "retrieved_at", "datetime"],
  ["source", "Fonte", "source", "text"],
  ["limitations", "Limitações", "limitations", "text"],
  ["classification_status", "Classificação", "classification_status", "text"],
  ["reference_lane", "Linha de referência", "reference_lane", "text"],
  ["presentation_mode", "Modo de apresentação", "presentation_mode", "text"],
  ["transferable", "Elemento transferível", "transferable", "text"],
  ["non_transferable", "Não transferir", "non_transferable", "text"],
  ["anti_copy_policy", "Política anti-cópia", "anti_copy_policy", "textarea"],
].map(([id, label, key, type]) => ({
  id,
  label,
  key,
  type: type as RecordFieldDefinition["type"],
  required: true,
}));

export function dailyResearchInputContract(): PluginInputContract[] {
  return [
    {
      id: "daily-research-queries",
      portKey: "consultas_es",
      label: "Consultas em espanhol",
      type: "list",
    },
  ];
}

export function dailyResearchOutputContract(): PluginFieldContract[] {
  return [
    {
      portKey: "videos",
      label: "Vídeos factuais encontrados",
      key: "videos",
      type: "records",
      required: true,
      recordFields: DAILY_RESEARCH_VIDEO_FIELDS,
    },
    {
      portKey: "preflight",
      label: "Pré-flight de quota (JSON)",
      key: "preflight",
      type: "textarea",
      required: true,
    },
  ];
}

export function isDailyResearchConfig(value: unknown): value is ChannelResearchConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as Partial<ChannelResearchConfig>;
  return (
    config.pluginId === DAILY_RESEARCH_PLUGIN_ID &&
    config.capabilityId === DAILY_RESEARCH_CAPABILITY_ID &&
    config.cadence === "manual_daily" &&
    typeof config.language === "string" &&
    typeof config.region === "string" &&
    Number.isInteger(config.minDurationSeconds) &&
    Number.isInteger(config.maxResults) &&
    Number.isInteger(config.maxCommentVideoSamples) &&
    Number.isInteger(config.maxEstimatedQuotaUnits) &&
    Array.isArray(config.queries) &&
    config.queries.length >= 1 &&
    config.queries.length <= 10 &&
    config.queries.every(
      (query: ChannelResearchQuery) =>
        typeof query?.id === "string" &&
        typeof query?.text === "string" &&
        ["core_faceless", "niche_bending", "presentation_mode", "unknown"].includes(
          query?.referenceLane,
        ),
    )
  );
}
