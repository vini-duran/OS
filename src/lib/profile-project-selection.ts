import type { PluginProfileSetup } from "@/lib/plugin-contract";

export const PROFILE_PROJECT_SELECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;

export type PortableProfileSetupResolution =
  | Pick<
      PluginProfileSetup,
      "configurationKey" | "fallbackConfigurationKey" | "namedUrls"
    >
  | null
  | undefined;

/**
 * Portable resolver distinguishing registry availability from optional setup.
 * - object: known plugin WITH profileSetup (strip owned keys).
 * - null: known/installed plugin WITHOUT profileSetup (preserve ordinary config).
 * - undefined: unknown/unavailable plugin (fail-closed unconfigured `{}`).
 * Resolver omitted entirely means legacy best-effort (preserve, drop IDs).
 */
export type PortableProfileSetupResolver = (
  pluginId: string,
) => PortableProfileSetupResolution;

/** Generic runtime configuration field receiving the resolved project URL, if opted in. */
export function managedProjectUrlConfigurationKey(
  profileSetup?: Pick<PluginProfileSetup, "namedUrls">,
): string | undefined {
  const key = profileSetup?.namedUrls?.configurationKey?.trim();
  return key ? key : undefined;
}

export function requiresProjectSelection(
  profileSetup?: Pick<PluginProfileSetup, "namedUrls">,
): boolean {
  return managedProjectUrlConfigurationKey(profileSetup) !== undefined;
}

/** Local configuration keys owned by the core for a browser-profile binding. */
export function localProfileConfigurationKeys(
  profileSetup?: Pick<
    PluginProfileSetup,
    "configurationKey" | "fallbackConfigurationKey" | "namedUrls"
  >,
): string[] {
  if (!profileSetup) return [];
  return [
    profileSetup.configurationKey,
    ...(profileSetup.fallbackConfigurationKey ? [profileSetup.fallbackConfigurationKey] : []),
    ...(managedProjectUrlConfigurationKey(profileSetup)
      ? [managedProjectUrlConfigurationKey(profileSetup)!]
      : []),
  ].filter((key, index, all) => Boolean(key) && all.indexOf(key) === index);
}

export function normalizeProjectSelections(
  value: unknown,
  profileIds: readonly string[],
): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const allowed = new Set(profileIds);
  const result: Record<string, string> = {};
  for (const [profileId, entryId] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(profileId)) continue;
    if (typeof entryId !== "string") continue;
    const trimmed = entryId.trim();
    if (!trimmed || !PROFILE_PROJECT_SELECTION_ID_PATTERN.test(trimmed)) continue;
    result[profileId] = trimmed;
  }
  return Object.keys(result).length ? result : undefined;
}

/** Shape-level validation for the local policy; existence is checked at the invocation boundary. */
export function validateProjectSelectionsShape(input: {
  projectSelections: unknown;
  profileIds: readonly string[];
  profileSetup?: PluginProfileSetup;
}): { projectSelections?: Record<string, string>; error?: string } {
  const { projectSelections, profileIds, profileSetup } = input;
  if (projectSelections === undefined) return {};
  if (!profileSetup?.namedUrls) {
    return { error: "Este plugin não oferece projetos nomeados neste perfil." };
  }
  if (!profileIds.length) return {};
  const normalized = normalizeProjectSelections(projectSelections, profileIds);
  if (projectSelections && typeof projectSelections === "object" && !normalized) {
    // An object with no usable entries: if it was explicitly non-empty, keep a diagnostic.
    const keys = Object.keys(projectSelections as Record<string, unknown>);
    if (keys.length) return { error: "A seleção local de projetos deste Bloco é inválida." };
    return {};
  }
  return normalized ? { projectSelections: normalized } : {};
}

export function withProjectSelections(
  configuration: Record<string, string | number | boolean>,
  profileSetup:
    | Pick<PluginProfileSetup, "configurationKey" | "fallbackConfigurationKey" | "namedUrls">
    | undefined,
  projectSelections: Record<string, string> | undefined,
): Record<string, string | number | boolean> {
  void projectSelections;
  // Selections live in profileExecution, never in portable configuration.
  return stripManagedProjectConfiguration(configuration, profileSetup);
}

/** Removes core-owned profile alias keys and the managed project URL value. */
export function stripManagedProjectConfiguration(
  configuration: Record<string, string | number | boolean>,
  profileSetup?: Pick<
    PluginProfileSetup,
    "configurationKey" | "fallbackConfigurationKey" | "namedUrls"
  >,
): Record<string, string | number | boolean> {
  if (!profileSetup) return { ...configuration };
  const keys = new Set(localProfileConfigurationKeys(profileSetup));
  if (!keys.size) return { ...configuration };
  return Object.fromEntries(Object.entries(configuration).filter(([key]) => !keys.has(key)));
}

/**
 * Fail-closed portable configuration sanitizer for export/share/package.
 *
 * Semantics (documented for the portable authorities):
 * - setup object: known plugin WITH profileSetup — strip only generic
 *   metadata-owned keys (configurationKey/fallback/managed project URL).
 *   Unrelated keys are preserved. No Flow-specific field names are guessed.
 * - null with resolver: known/installed plugin WITHOUT profileSetup —
 *   preserve ordinary configuration as-is (no owned keys exist).
 * - resolver omitted (legacy caller): metadata unknown, so configuration is
 *   preserved as-is. Callers still always drop physical/catalog IDs
 *   (profileExecution/connectionId). Managed-URL stripping is best-effort
 *   only when metadata is available; this limit is explicit.
 * - undefined with resolver: unknown/unavailable plugin — do NOT preserve
 *   raw configuration (it may carry a stale managed URL under an unknown
 *   key). Return an explicit sanitized unconfigured portable block (`{}`),
 *   with IDs dropped by the caller. This is conservative and may drop
 *   unrelated keys for unknown plugins; known plugins are unaffected.
 */
export function sanitizePortableConfiguration(
  configuration: Record<string, string | number | boolean>,
  profileSetup: PortableProfileSetupResolution,
  resolverProvided: boolean,
): Record<string, string | number | boolean> {
  if (profileSetup) return stripManagedProjectConfiguration(configuration, profileSetup);
  if (!resolverProvided) return { ...configuration };
  if (profileSetup === null) return { ...configuration };
  return {};
}
