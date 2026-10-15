import type Database from "better-sqlite3";
import type {
  PluginManifest,
  PluginProfileSetup,
  PluginProfileSetupNamedUrls,
} from "../src/lib/plugin-contract";
import { managedProjectUrlConfigurationKey } from "../src/lib/profile-project-selection";
import {
  validateAndNormalizePluginProfileNamedUrl,
  type PluginProfileNamedUrlEntry,
} from "./plugin-profile-named-urls";
import type { ResolvedProfileExecutionSnapshot } from "./profile-execution-policy";

export type ProjectSelectionErrorCode =
  | "PROJECT_SELECTION_REQUIRED"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_FOREIGN"
  | "PROJECT_PROFILE_UNBOUND"
  | "PROJECT_URL_INVALID"
  | "PROJECT_DESTINATION_CHANGED";

export class ProjectSelectionError extends Error {
  constructor(
    public readonly code: ProjectSelectionErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProjectSelectionError";
  }
}

export function projectConfigurationKeyForManifest(
  manifest: Pick<PluginManifest, "profileSetup">,
): string | undefined {
  return managedProjectUrlConfigurationKey(manifest.profileSetup);
}

function setupDiagnostic(profileAlias?: string): string {
  // Developer log in PT-BR (structured runtime error). User-visible text is
  // rendered by the client from ProjectSelectionError.code via existing
  // localized strings (t("Nenhum projeto selecionado para este perfil."),
  // pluginProfileNamedUrlsText("selectProject"/"projectEmpty", lang)).
  // Legacy wording preserved; no new recovery policy is introduced here.
  return profileAlias
    ? `Selecione um projeto nomeado para o perfil ${profileAlias} na configuração do Bloco. Cadastre URLs em Plugins, na seção Projetos deste perfil.`
    : "Selecione um projeto nomeado para cada perfil na configuração do Bloco. Cadastre URLs em Plugins, na seção Projetos deste perfil.";
}

function destinationChangedDiagnostic(profileAlias?: string): string {
  // Frozen-destination guard (PT developer log). User-visible text renders
  // client-side from PROJECT_DESTINATION_CHANGED via t()/named-urls PT/EN/ES.
  // Editing a catalog URL affects NEW jobs only; existing jobs block here
  // instead of silently switching destination. No recovery action is invented.
  return profileAlias
    ? `O destino do projeto do perfil ${profileAlias} mudou no catálogo. Escolha novamente o projeto na configuração do Bloco antes de executar.`
    : "O destino de um projeto selecionado mudou no catálogo. Escolha novamente o projeto na configuração do Bloco antes de executar.";
}
type NamedUrlRow = {
  id: string;
  name: string;
  url: string;
};

function findEntry(
  database: Database.Database,
  pluginId: string,
  profileId: string,
  entryId: string,
): NamedUrlRow | undefined {
  return database
    .prepare(
      `SELECT id, name, url FROM plugin_profile_named_urls
       WHERE plugin_id = ? AND profile_id = ? AND id = ?`,
    )
    .get(pluginId, profileId, entryId) as NamedUrlRow | undefined;
}

function entryExistsElsewhere(database: Database.Database, entryId: string): boolean {
  return Boolean(
    database.prepare(`SELECT 1 FROM plugin_profile_named_urls WHERE id = ?`).get(entryId),
  );
}

export function resolveProjectUrlsForPolicy(input: {
  database: Database.Database;
  pluginId: string;
  profileSetup: PluginProfileSetup;
  namedUrls: PluginProfileSetupNamedUrls & { configurationKey: string };
  policy: { profileIds: string[]; projectSelections?: Record<string, string> };
  resolveAlias: (profileId: string) => string | undefined;
  isBoundProfile: (profileId: string) => boolean;
}): { urls: Record<string, string>; entries: Record<string, PluginProfileNamedUrlEntry> } {
  const urls: Record<string, string> = {};
  const entries: Record<string, PluginProfileNamedUrlEntry> = {};
  for (const profileId of input.policy.profileIds) {
    if (!input.isBoundProfile(profileId)) {
      throw new ProjectSelectionError(
        "PROJECT_PROFILE_UNBOUND",
        422,
        "Um perfil selecionado não está vinculado localmente a este plugin.",
      );
    }
    const entryId = input.policy.projectSelections?.[profileId]?.trim();
    if (!entryId) {
      throw new ProjectSelectionError(
        "PROJECT_SELECTION_REQUIRED",
        422,
        setupDiagnostic(input.resolveAlias(profileId)),
      );
    }
    const row = findEntry(input.database, input.pluginId, profileId, entryId);
    if (!row) {
      if (entryExistsElsewhere(input.database, entryId)) {
        throw new ProjectSelectionError(
          "PROJECT_FOREIGN",
          422,
          setupDiagnostic(input.resolveAlias(profileId)),
        );
      }
      throw new ProjectSelectionError(
        "PROJECT_NOT_FOUND",
        422,
        setupDiagnostic(input.resolveAlias(profileId)),
      );
    }
    let url: string;
    try {
      url = validateAndNormalizePluginProfileNamedUrl(row.url, input.namedUrls);
    } catch {
      throw new ProjectSelectionError(
        "PROJECT_URL_INVALID",
        422,
        setupDiagnostic(input.resolveAlias(profileId)),
      );
    }
    urls[profileId] = url;
    entries[profileId] = {
      id: row.id,
      name: row.name,
      url,
      createdAt: "",
      updatedAt: "",
    };
  }
  return { urls, entries };
}

/**
 * Creation-boundary helper for NEW jobs only: resolves the current catalog
 * URLs for the snapshot selections. Production callers must pass the
 * canonical binding authority (plugin_profile_bindings) as isBoundProfile;
 * the snapshot-membership default exists only for isolated synthetic tests.
 * Never call this to "update" an already-persisted job destination.
 */
export function attachProjectUrlsToSnapshot(input: {
  database: Database.Database;
  plugin: { id: string; manifest: PluginManifest };
  snapshot: ResolvedProfileExecutionSnapshot | undefined;
  resolveAlias?: (profileId: string) => string | undefined;
  isBoundProfile?: (profileId: string) => boolean;
}): ResolvedProfileExecutionSnapshot | undefined {
  const { snapshot } = input;
  if (!snapshot) return undefined;
  const namedUrls = input.plugin.manifest.profileSetup?.namedUrls;
  const projectKey = projectConfigurationKeyForManifest(input.plugin.manifest);
  if (!namedUrls || !projectKey) return snapshot;
  const typed = namedUrls as PluginProfileSetupNamedUrls & { configurationKey: string };
  const resolveAlias =
    input.resolveAlias ??
    ((profileId) => snapshot.profiles.find((p) => p.profileId === profileId)?.alias);
  const isBoundProfile =
    input.isBoundProfile ??
    ((profileId) => snapshot.profiles.some((p) => p.profileId === profileId));
  const { urls } = resolveProjectUrlsForPolicy({
    database: input.database,
    pluginId: input.plugin.id,
    profileSetup: input.plugin.manifest.profileSetup!,
    namedUrls: { ...typed, configurationKey: projectKey },
    policy: { profileIds: snapshot.profileIds, projectSelections: snapshot.projectSelections },
    resolveAlias,
    isBoundProfile,
  });
  return {
    ...snapshot,
    projectConfigurationKey: projectKey,
    projectUrls: urls,
  };
}

/** Active profile id for a persisted job (fallback-aware). */
export function activeProfileIdForJob(job: {
  profileExecution?: ResolvedProfileExecutionSnapshot;
  profileFallback?: { activeIndex: number };
}): string | undefined {
  if (!job.profileExecution) return undefined;
  const index = job.profileFallback?.activeIndex ?? 0;
  return job.profileExecution.profiles[index]?.profileId;
}

/** Ordinary URL value for the active profile; throws a setup diagnostic when unavailable. */
export function projectUrlForActiveProfile(
  snapshot: ResolvedProfileExecutionSnapshot | undefined,
  activeIndex: number,
): string | undefined {
  if (!snapshot?.projectConfigurationKey) return undefined;
  const profileId = snapshot.profiles[activeIndex]?.profileId;
  if (!profileId) return undefined;
  const url = snapshot.projectUrls?.[profileId];
  if (!url) {
    const alias = snapshot.profiles[activeIndex]?.alias;
    throw new ProjectSelectionError("PROJECT_SELECTION_REQUIRED", 422, setupDiagnostic(alias));
  }
  return url;
}

/**
 * Frozen-destination guard for EXISTING jobs. Compares the normalized frozen
 * snapshot URL against the current catalog value for every selected profile
 * BEFORE any provider/browser effect. A stable catalog-ID rename (same URL)
 * passes and returns the ORIGINAL snapshot unchanged; a catalog URL edit for
 * the same ID blocks with non-retryable PROJECT_DESTINATION_CHANGED and never
 * rewrites projectUrls in the active job. Deleted/foreign/invalid/unbound
 * also block. Editing a URL affects NEW jobs only. Completed media/workunits
 * are preserved by the caller (failed job keeps partials); no recovery action
 * is invented here or in the plugin.
 */
export function refreshActiveProjectUrl(input: {
  database: Database.Database;
  plugin: { id: string; manifest: PluginManifest };
  snapshot: ResolvedProfileExecutionSnapshot;
  activeIndex: number;
  resolveAlias?: (profileId: string) => string | undefined;
  isBoundProfile?: (profileId: string) => boolean;
}): ResolvedProfileExecutionSnapshot {
  const projectKey = projectConfigurationKeyForManifest(input.plugin.manifest);
  if (!projectKey) return input.snapshot;
  const namedUrls = input.plugin.manifest.profileSetup?.namedUrls as
    (PluginProfileSetupNamedUrls & { configurationKey: string }) | undefined;
  const refreshed = attachProjectUrlsToSnapshot({
    database: input.database,
    plugin: input.plugin,
    snapshot: input.snapshot,
    ...(input.resolveAlias ? { resolveAlias: input.resolveAlias } : {}),
    ...(input.isBoundProfile ? { isBoundProfile: input.isBoundProfile } : {}),
  });
  // Ensure the active profile specifically resolves; attach validates all profiles.
  projectUrlForActiveProfile(refreshed, input.activeIndex);
  const freshUrls = refreshed!.projectUrls ?? {};
  const frozenUrls = input.snapshot.projectUrls ?? {};
  for (const profileId of input.snapshot.profileIds) {
    const frozen = frozenUrls[profileId];
    if (!frozen) {
      const alias = input.snapshot.profiles.find((p) => p.profileId === profileId)?.alias;
      throw new ProjectSelectionError("PROJECT_SELECTION_REQUIRED", 422, setupDiagnostic(alias));
    }
    const fresh = freshUrls[profileId];
    if (!fresh) {
      const alias = input.snapshot.profiles.find((p) => p.profileId === profileId)?.alias;
      throw new ProjectSelectionError("PROJECT_SELECTION_REQUIRED", 422, setupDiagnostic(alias));
    }
    // Compare normalized values: rename (same URL) passes, URL edit blocks.
    let normalizedFrozen: string;
    try {
      normalizedFrozen = validateAndNormalizePluginProfileNamedUrl(frozen, {
        ...namedUrls!,
        configurationKey: projectKey,
      });
    } catch {
      const alias = input.snapshot.profiles.find((p) => p.profileId === profileId)?.alias;
      throw new ProjectSelectionError("PROJECT_URL_INVALID", 422, setupDiagnostic(alias));
    }
    if (normalizedFrozen !== fresh) {
      const alias = input.snapshot.profiles.find((p) => p.profileId === profileId)?.alias;
      throw new ProjectSelectionError(
        "PROJECT_DESTINATION_CHANGED",
        422,
        destinationChangedDiagnostic(alias),
      );
    }
  }
  // Frozen destination confirmed: return the ORIGINAL snapshot so callers can
  // never persist a silently switched destination.
  return input.snapshot;
}
