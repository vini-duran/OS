import type {
  ProjectCleanupConfig,
  RuntimeValue,
  StoredFile,
  StructuredRecord,
} from "@/lib/domain";

export const PROJECT_CLEANUP_STATUS_KEYS = [
  "cutmotions_final_status",
  "instagram_final_status",
  "facebook_final_status",
  "youtube_final_status",
] as const;

export type ProjectCleanupStatusKey = (typeof PROJECT_CLEANUP_STATUS_KEYS)[number];
export type ProjectCleanupFinalStatus =
  "" | "scheduled" | "published" | "rejected" | "deleted" | "private";
export type ProjectCleanupStatuses = Record<ProjectCleanupStatusKey, ProjectCleanupFinalStatus>;

export const EMPTY_PROJECT_CLEANUP_STATUSES: ProjectCleanupStatuses = {
  cutmotions_final_status: "",
  instagram_final_status: "",
  facebook_final_status: "",
  youtube_final_status: "",
};

export type ProjectCleanupResponse = {
  values: {
    retention_preview?: StoredFile;
    brief_preview?: StoredFile;
    publication_checks?: StructuredRecord[];
    retention_records?: StructuredRecord[];
    retention_summary?: string;
    production_history?: StoredFile[];
  } & Record<string, RuntimeValue | undefined>;
  logs?: string[];
};

const allowedStatuses = new Set<ProjectCleanupFinalStatus>([
  "",
  "scheduled",
  "published",
  "rejected",
  "deleted",
  "private",
]);

export function normalizeProjectCleanupStatuses(value: unknown): ProjectCleanupStatuses {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    PROJECT_CLEANUP_STATUS_KEYS.map((key) => {
      const status = typeof candidate[key] === "string" ? candidate[key].trim().toLowerCase() : "";
      return [key, allowedStatuses.has(status as ProjectCleanupFinalStatus) ? status : ""];
    }),
  ) as ProjectCleanupStatuses;
}

export function projectCleanupConfigurationIssue(config?: ProjectCleanupConfig) {
  if (!config) return "Configure a ação de limpeza deste canal antes de usá-la.";
  if (!config.pluginId.trim()) return "A limpeza não possui plugin configurado.";
  if (!config.previewCapabilityId.trim() || !config.applyCapabilityId.trim()) {
    return "A limpeza não possui as capacidades de prévia e aplicação configuradas.";
  }
  return undefined;
}

async function cleanupRequest(
  projectId: string,
  phase: "preview" | "apply",
  body: Record<string, unknown>,
): Promise<ProjectCleanupResponse> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/cleanup/${phase}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as ProjectCleanupResponse & {
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error ?? "A ação de limpeza não pôde ser executada.");
  return payload;
}

export function previewProjectCleanup(projectId: string, statuses: ProjectCleanupStatuses) {
  return cleanupRequest(projectId, "preview", { statuses });
}

export function applyProjectCleanup(
  projectId: string,
  preview: StoredFile,
  statuses: ProjectCleanupStatuses,
) {
  return cleanupRequest(projectId, "apply", {
    preview,
    statuses,
    cleanupConfirmation: true,
  });
}

export function formatCleanupBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** unit;
  return `${amount.toLocaleString("pt-BR", { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
}
