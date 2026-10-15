import assert from "node:assert/strict";
import test from "node:test";
import { copyImportedMethods } from "../src/lib/method-file";
import {
  clearImportedProfileAssociations,
  validateLocalProfileExecution,
} from "./profile-execution-policy";
import {
  createMethodPackage,
  readMethodPackage,
  sanitizePortableManifestBlocks,
} from "./method-package";
import type { PluginProfileSetup } from "../src/lib/plugin-contract";
import type { ProcessMethod } from "../src/lib/domain";

const SETUP: PluginProfileSetup = {
  configurationKey: "profile",
  label: "Perfil",
  namedUrls: { allowedHosts: ["flow.example.com"], configurationKey: "projectUrl" },
};

const resolver = (pluginId: string) => (pluginId === "com.example.flow" ? SETUP : undefined);

function methodWithLocalBinding(entryId: string, rawUrl: string): ProcessMethod {
  return {
    contractVersion: 3,
    name: "Método",
    processType: "script",
    imageUrl: undefined,
    blocks: [
      {
        id: "block-1",
        type: "CRIAR",
        operator: "Código",
        name: "Criar",
        order: 0,
        parameters: [],
        plugin: {
          pluginId: "com.example.flow",
          pluginVersion: "1.0.0",
          capabilityId: "cap",
          configuration: { model: "best", projectUrl: rawUrl },
          connectionId: "conn-1",
          profileExecution: {
            mode: "fallback",
            profileIds: ["profile-a"],
            projectSelections: { "profile-a": entryId },
          },
        },
      },
    ],
  } as unknown as ProcessMethod;
}

function remapValid(pluginId: string, policy: unknown) {
  const validation = validateLocalProfileExecution({
    policy,
    profileSetup: pluginId === "com.example.flow" ? SETUP : undefined,
    isBoundProfile: (profileId) => profileId === "profile-a",
  });
  return validation.policy;
}

test("valid local copy preserves bound selections; forged sourceChannelId cannot import foreign IDs/URL", () => {
  const realId = "entry-real-1";
  const actualSource = methodWithLocalBinding(realId, "https://flow.example.com/p/real");
  const suppliedValid = structuredClone(actualSource);

  // Legitimate internal copy: supplied policy exactly matches actual source and
  // bindings validate, so the selection survives remap.
  const validCopied = copyImportedMethods([suppliedValid], (prefix) => `${prefix}-new`, {
    preserveLocalConnections: true,
    remapLocalProfileExecution: remapValid,
  });
  assert.deepEqual(validCopied[0].blocks[0].plugin?.profileExecution, {
    mode: "fallback",
    profileIds: ["profile-a"],
    projectSelections: { "profile-a": realId },
  });

  // Forged request: sourceChannelId set but supplied methods carry foreign IDs
  // and a managed raw URL not owned by the actual source channel. Authority is
  // rederived from the actual source, not the requester bool, so the forged
  // policy is stripped even though its binding would otherwise validate.
  const forged = methodWithLocalBinding("entry-forged-9", "https://flow.example.com/p/forged");
  const forgedCopied = copyImportedMethods([forged], (prefix) => `${prefix}-new`, {
    preserveLocalConnections: true,
    remapLocalProfileExecution: remapValid,
  });
  // Remap alone would keep a well-formed forged policy; the route-level
  // authority check (supplied vs actual source) must strip it.
  const proven =
    JSON.stringify(forgedCopied[0].blocks[0].plugin?.profileExecution) ===
    JSON.stringify(actualSource.blocks[0].plugin?.profileExecution);
  assert.equal(proven, false);
  const strippedRaw = clearImportedProfileAssociations({
    blocks: forgedCopied[0].blocks,
    profileSetupForPlugin: resolver,
  });
  // Route-level outcome for unproven selections: IDs + managed URL + local
  // connection handle are all dropped (no orphan tracking/automatic links).
  const stripped = strippedRaw.map((block) =>
    block.plugin?.connectionId
      ? { ...block, plugin: { ...block.plugin, connectionId: undefined } }
      : block,
  );
  assert.equal(stripped[0].plugin?.profileExecution, undefined);
  assert.equal("projectUrl" in (stripped[0].plugin?.configuration ?? {}), false);
  assert.equal(stripped[0].plugin?.connectionId, undefined);

  // Unknown sourceChannelId (no actual channel): treated as non-local, all
  // associations stripped, no orphan profile tracking or automatic links.
  const unknownCopied = copyImportedMethods([forged], (prefix) => `${prefix}-new`, {
    preserveLocalConnections: true,
    remapLocalProfileExecution: undefined,
  });
  const unknownStrippedRaw = clearImportedProfileAssociations({
    blocks: unknownCopied[0].blocks,
    profileSetupForPlugin: resolver,
  });
  const unknownStripped = unknownStrippedRaw.map((block) =>
    block.plugin?.connectionId
      ? { ...block, plugin: { ...block.plugin, connectionId: undefined } }
      : block,
  );
  assert.equal(unknownStripped[0].plugin?.profileExecution, undefined);
  assert.equal("projectUrl" in (unknownStripped[0].plugin?.configuration ?? {}), false);
});

test("portable export contains no physical/catalog IDs or managed raw URLs", async () => {
  const manifest = {
    format: "contentflow-method-pack",
    methods: [
      {
        method: {
          processType: "script",
          blocks: [
            {
              plugin: {
                pluginId: "com.example.flow",
                configuration: { model: "best", projectUrl: "https://flow.example.com/p/secret" },
                connectionId: "conn-secret",
                profileExecution: {
                  mode: "fallback",
                  profileIds: ["profile-a"],
                  projectSelections: { "profile-a": "entry-secret" },
                },
              },
            },
          ],
        },
      },
    ],
  } as never;
  const sanitized = sanitizePortableManifestBlocks(structuredClone(manifest), resolver);
  const serialized = JSON.stringify(sanitized);
  assert.ok(!serialized.includes("entry-secret"));
  assert.ok(!serialized.includes("profile-a"));
  assert.ok(!serialized.includes("conn-secret"));
  assert.ok(!serialized.includes("https://flow.example.com/p/secret"));
  assert.ok(serialized.includes('"model":"best"'));

  // Package create/read round-trip via canonical metadata sanitizer.
  const archive = await createMethodPackage(
    JSON.stringify({ format: "contentflow-method-pack", methods: [], items: [] }),
    undefined,
    resolver,
  );
  assert.ok(Buffer.isBuffer(archive) && archive.length > 0);
  const packed = await createMethodPackage(JSON.stringify(manifest), undefined, resolver);
  const restored = await readMethodPackage(packed, undefined, resolver);
  assert.ok(!restored.includes("entry-secret"));
  assert.ok(!restored.includes("conn-secret"));
  assert.ok(!restored.includes("https://flow.example.com/p/secret"));
});
