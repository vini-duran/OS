import type { ActionBlock, ProfileExecutionPolicy } from "../src/lib/domain";
import type { PluginProfileSetup } from "../src/lib/plugin-contract";
import type { PortableProfileSetupResolver } from "../src/lib/profile-project-selection";
import {
  managedProjectUrlConfigurationKey,
  normalizeProjectSelections,
} from "../src/lib/profile-project-selection";

export type ResolvedProfileExecutionSnapshot = ProfileExecutionPolicy & {
  configurationKey: string;
  profiles: Array<{ profileId: string; alias: string }>;
  /** Generic opt-in runtime field receiving the resolved project URL, when declared. */
  projectConfigurationKey?: string;
  /** Stable catalog entry id per physical profile, resolved at the invocation boundary. */
  projectSelections?: Record<string, string>;
  /** Resolved ordinary URL per physical profile. Never carries IDs to the plugin. */
  projectUrls?: Record<string, string>;
};

export type LocalProfileExecutionValidation = {
  policy?: ProfileExecutionPolicy;
  error?: string;
};

function legacyFallbackAliases(value: unknown) {
  return typeof value === "string"
    ? value
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter((item, index, all) => item && all.indexOf(item) === index)
    : [];
}

export function normalizeStoredProfileExecution(
  value: unknown,
): ProfileExecutionPolicy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Partial<ProfileExecutionPolicy> & { mode?: string };
  if (source.mode !== "single" && source.mode !== "fallback" && source.mode !== "parallel") {
    return undefined;
  }
  if (!Array.isArray(source.profileIds)) return undefined;
  const profileIds = source.profileIds
    .filter((profileId): profileId is string => typeof profileId === "string")
    .map((profileId) => profileId.trim())
    .filter((profileId, index, all) => profileId && all.indexOf(profileId) === index);
  if (!profileIds.length) return undefined;

  const projectSelections = normalizeProjectSelections(
    (source as { projectSelections?: unknown }).projectSelections,
    profileIds,
  );
  const withSelections = (policy: ProfileExecutionPolicy): ProfileExecutionPolicy =>
    projectSelections ? { ...policy, projectSelections } : policy;

  if (source.mode === "single")
    return withSelections({ mode: "fallback", profileIds: [profileIds[0]] });
  if (source.mode === "fallback") {
    return withSelections({ mode: "fallback", profileIds });
  }
  if (profileIds.length === 1) return withSelections({ mode: "fallback", profileIds });
  const maxParallel =
    typeof source.maxParallel === "number" && Number.isFinite(source.maxParallel)
      ? Math.max(1, Math.min(profileIds.length, Math.trunc(source.maxParallel)))
      : profileIds.length;
  return withSelections({ mode: "parallel", profileIds, maxParallel });
}

export function validateLocalProfileExecution(input: {
  policy: unknown;
  profileSetup?: PluginProfileSetup;
  isBoundProfile: (profileId: string) => boolean;
}): LocalProfileExecutionValidation {
  if (input.policy === undefined) return {};
  const policy = normalizeStoredProfileExecution(input.policy);
  if (!policy) {
    return { error: "A política local de perfis deste Bloco é inválida." };
  }
  if (!input.profileSetup) {
    return {
      error: "Este plugin não declara perfis de navegador para a política local deste Bloco.",
    };
  }
  const unbound = policy.profileIds.find((profileId) => !input.isBoundProfile(profileId));
  if (unbound) {
    return {
      error: "Um perfil selecionado não está vinculado localmente a este plugin.",
    };
  }
  // Catalog-only declarations (no namedUrls.configurationKey) keep Stage 1 behavior:
  // any stored projectSelections are dropped instead of failing older Methods.
  const projectKey = managedProjectUrlConfigurationKey(input.profileSetup);
  if (!projectKey) {
    if (policy.projectSelections) {
      const { projectSelections: _dropped, ...rest } = policy;
      return { policy: rest };
    }
    return { policy };
  }
  // Opt-in declarations keep the selection shape local; existence is enforced
  // at the invocation boundary with a setup diagnostic, not by rewriting Methods.
  if (policy.projectSelections) {
    const normalized = normalizeProjectSelections(policy.projectSelections, policy.profileIds);
    const rawKeys = Object.keys(policy.projectSelections);
    if (!normalized && rawKeys.length) {
      return { error: "A seleção local de projetos deste Bloco é inválida." };
    }
    return { policy: normalized ? { ...policy, projectSelections: normalized } : policy };
  }
  return { policy };
}

export function clearImportedProfileAssociations(input: {
  blocks: ActionBlock[];
  profileSetupForPlugin: PortableProfileSetupResolver;
}) {
  return input.blocks.map((block) => {
    if (!block.plugin) return block;
    const setup = input.profileSetupForPlugin(block.plugin.pluginId);
    // Forged portable imports never confer local trust: physical/catalog IDs
    // (profileExecution) are always dropped, even for unknown plugins where
    // the managed key cannot be resolved. Managed raw URLs are stripped via
    // the canonical sanitizer when real metadata is available. Known plugins
    // without profileSetup (null) keep ordinary configuration; unknown
    // plugins (undefined) fail closed to an explicit unconfigured `{}` so no
    // stale URL can survive under an unknown key (no Flow-specific guessing).
    if (setup === undefined) {
      return {
        ...block,
        plugin: {
          ...block.plugin,
          configuration: {},
          profileExecution: undefined,
        },
      };
    }
    if (setup === null) {
      return {
        ...block,
        plugin: {
          ...block.plugin,
          configuration: { ...block.plugin.configuration },
          profileExecution: undefined,
        },
      };
    }
    const configuration = { ...block.plugin.configuration };
    delete configuration[setup.configurationKey];
    if (setup.fallbackConfigurationKey) delete configuration[setup.fallbackConfigurationKey];
    const projectKey = managedProjectUrlConfigurationKey(setup);
    if (projectKey) delete configuration[projectKey];
    return {
      ...block,
      plugin: {
        ...block.plugin,
        configuration,
        profileExecution: undefined,
      },
    };
  });
}

/**
 * Route-wired authority for local method-transfer copies.
 *
 * Proves EVERY local association per block against the authoritative source
 * channel, not against the requester boolean or policy shape alone:
 * - same source process/block identity (caller passes aligned blocks),
 * - matching source block via actual ID or canonical portable process/index key,
 *   and pluginId + capabilityId across actual/supplied/copied,
 * - when a policy exists, supplied policy JSON exactly equals stored actual
 *   policy, and copied (remapped/validated) policy still equals it.
 * Permitted connectionId/policy derive from the ACTUAL source block; a
 * supplied arbitrary connection never survives (proven blocks adopt the
 * actual connectionId). Every unproven block — including dropped invalid policy, no
 * managed URL, mismatched plugin/capability, or dropped invalid policy — is
 * stripped of profileExecution + connectionId + managed raw URL (fail-closed
 * `{}` for unknown plugins). Pure helper wired into the actual apply route.
 */
export function authorizeLocalBlockCopy(input: {
  actualBlock: ActionBlock | undefined;
  suppliedBlock: ActionBlock | undefined;
  copiedBlock: ActionBlock;
  /** Canonical process/index key emitted by planPortableMethodTransfer, when used. */
  expectedPortableBlockId?: string;
  profileSetupForPlugin: PortableProfileSetupResolver;
}): ActionBlock {
  const {
    actualBlock,
    suppliedBlock,
    copiedBlock,
    expectedPortableBlockId,
    profileSetupForPlugin,
  } = input;
  if (!copiedBlock.plugin) return copiedBlock;
  const actualPlugin = actualBlock?.plugin;
  const suppliedPlugin = suppliedBlock?.plugin;
  const copiedPlugin = copiedBlock.plugin;
  const actualPolicy = actualPlugin?.profileExecution;
  const suppliedPolicy = suppliedPlugin?.profileExecution;
  const copiedPolicy = copiedPlugin.profileExecution;
  const pluginMatch =
    Boolean(actualPlugin) &&
    (actualBlock?.id === suppliedBlock?.id ||
      (expectedPortableBlockId !== undefined && suppliedBlock?.id === expectedPortableBlockId)) &&
    actualPlugin?.pluginId === suppliedPlugin?.pluginId &&
    actualPlugin?.pluginId === copiedPlugin.pluginId &&
    actualPlugin?.capabilityId === suppliedPlugin?.capabilityId &&
    actualPlugin?.capabilityId === copiedPlugin.capabilityId;
  const policyProven = actualPolicy
    ? Boolean(suppliedPolicy) &&
      Boolean(copiedPolicy) &&
      JSON.stringify(actualPolicy) === JSON.stringify(suppliedPolicy) &&
      JSON.stringify(copiedPolicy) === JSON.stringify(actualPolicy)
    : suppliedPolicy === undefined && copiedPolicy === undefined;
  const proven = Boolean(pluginMatch) && policyProven;
  if (proven) {
    // For policy-free copies, source configuration is authoritative too. This
    // preserves ordinary plugin settings while preventing a forged managed URL
    // from being introduced alongside a valid channel/block identity.
    return {
      ...copiedBlock,
      plugin: {
        ...copiedPlugin,
        ...(actualPolicy ? {} : { configuration: { ...actualPlugin!.configuration } }),
        connectionId: actualPlugin?.connectionId,
      },
    };
  }
  const [stripped] = clearImportedProfileAssociations({
    blocks: [copiedBlock],
    profileSetupForPlugin,
  });
  if (stripped.plugin?.connectionId) {
    return { ...stripped, plugin: { ...stripped.plugin, connectionId: undefined } };
  }
  return stripped;
}

export function materializeLocalProfileExecution(input: {
  blocks: ActionBlock[];
  profileSetupForPlugin: PortableProfileSetupResolver;
  resolveAlias: (pluginId: string, alias: string) => { profileId: string } | undefined;
}) {
  return input.blocks.map((block) => {
    if (!block.plugin) return block;
    const stored = normalizeStoredProfileExecution(block.plugin.profileExecution);
    if (stored) {
      return { ...block, plugin: { ...block.plugin, profileExecution: stored } };
    }

    const setup = input.profileSetupForPlugin(block.plugin.pluginId);
    if (!setup) return block;
    const primaryAlias = String(block.plugin.configuration[setup.configurationKey] ?? "").trim();
    if (!primaryAlias) return block;
    const aliases = [
      primaryAlias,
      ...(setup.fallbackConfigurationKey
        ? legacyFallbackAliases(block.plugin.configuration[setup.fallbackConfigurationKey])
        : []),
    ].filter(
      (alias, index, all) =>
        all.findIndex(
          (candidate) => candidate.toLocaleLowerCase() === alias.toLocaleLowerCase(),
        ) === index,
    );
    const resolved = aliases.map((alias) => input.resolveAlias(block.plugin!.pluginId, alias));
    if (resolved.some((profile) => !profile)) return block;
    const uniqueProfileIds = resolved
      .map((profile) => profile!.profileId)
      .filter((profileId, index, all) => all.indexOf(profileId) === index);
    if (!uniqueProfileIds.length) return block;
    const profileExecution: ProfileExecutionPolicy = {
      mode: "fallback",
      profileIds: uniqueProfileIds,
    };
    return { ...block, plugin: { ...block.plugin, profileExecution } };
  });
}

export function resolveProfileExecutionSnapshot(input: {
  policy: unknown;
  configurationKey: string;
  projectConfigurationKey?: string;
  projectSelections?: Record<string, string>;
  resolveProfile: (
    profileId: string,
  ) => { profileId: string; alias: string; readinessState?: string } | undefined;
}): ResolvedProfileExecutionSnapshot | undefined {
  const policy = normalizeStoredProfileExecution(input.policy);
  if (!policy) return undefined;

  const profiles = policy.profileIds.map((profileId) => {
    const resolved = input.resolveProfile(profileId);
    if (!resolved) {
      throw new Error("Um perfil selecionado não está mais vinculado a este plugin.");
    }
    if (resolved.readinessState !== "ready") {
      throw new Error(`O perfil ${resolved.alias} ainda não está preparado para este plugin.`);
    }
    return { profileId: resolved.profileId, alias: resolved.alias };
  });

  const snapshot: ResolvedProfileExecutionSnapshot = {
    ...policy,
    configurationKey: input.configurationKey,
    profiles,
  };
  if (input.projectConfigurationKey) {
    snapshot.projectConfigurationKey = input.projectConfigurationKey;
    const selections =
      input.projectSelections ??
      normalizeProjectSelections(policy.projectSelections, policy.profileIds);
    if (selections) snapshot.projectSelections = { ...selections };
  }
  return snapshot;
}
