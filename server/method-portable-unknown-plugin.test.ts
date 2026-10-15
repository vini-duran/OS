import assert from "node:assert/strict";
import test from "node:test";
import {
  planPortableMethodTransfer,
  sanitizePortableTransferPlan,
  serializeMethodFile,
  serializeMethodPackFile,
  serializePortableMethodTransfer,
} from "../src/lib/method-file";
import {
  createMethodPackage,
  readMethodPackage,
  sanitizePortableManifestBlocks,
} from "./method-package";
import { clearImportedProfileAssociations } from "./profile-execution-policy";
import type { ProcessMethod } from "../src/lib/domain";

const KNOWN_SETUP = {
  configurationKey: "profile",
  label: "Perfil",
  namedUrls: { allowedHosts: ["flow.example.com"], configurationKey: "projectUrl" },
} as never;

// Unrelated known plugin: declares profile binding but no managed project URL.
const UNRELATED_SETUP = {
  configurationKey: "profile",
  label: "Perfil",
} as never;

const resolver = (pluginId: string) =>
  pluginId === "com.example.flow"
    ? (KNOWN_SETUP as never)
    : pluginId === "com.example.unrelated"
      ? (UNRELATED_SETUP as never)
      : pluginId === "com.example.plain"
        ? null
        : undefined;

function unknownMethod(withPolicy: boolean): ProcessMethod {
  return {
    contractVersion: 3,
    name: "Método",
    processType: "script",
    blocks: [
      {
        id: "block-1",
        type: "CRIAR",
        operator: "Código",
        name: "Criar",
        order: 0,
        parameters: [],
        plugin: {
          pluginId: "com.example.unknown",
          pluginVersion: "1.0.0",
          capabilityId: "cap",
          configuration: {
            model: "best",
            projectUrl: "https://flow.example.com/p/stale-unknown",
          },
          connectionId: "conn-unknown",
          ...(withPolicy
            ? {
                profileExecution: {
                  mode: "fallback",
                  profileIds: ["profile-a"],
                  projectSelections: { "profile-a": "entry-unknown" },
                },
              }
            : {}),
        },
      },
    ],
  } as unknown as ProcessMethod;
}

for (const withPolicy of [true, false]) {
  test(`unknown plugin export sanitizer fail-closes with policy ${withPolicy ? "present" : "absent"}`, () => {
    const source = unknownMethod(withPolicy);
    const plan = planPortableMethodTransfer({
      name: "Pacote",
      channelName: "Canal",
      primaryProcessTypes: ["script"],
      processOrder: [
        "script",
        "title",
        "thumbnail",
        "narration",
        "assets",
        "editing",
        "publishing",
        "theme",
      ],
      sourceMethods: [source],
      collections: [],
      items: [],
      includeItems: false,
      profileSetupForPlugin: resolver as never,
    });
    const json = JSON.stringify(plan);
    assert.ok(!json.includes("stale-unknown"), "raw stale URL leaked in plan");
    assert.ok(!json.includes("entry-unknown"), "catalog ID leaked in plan");
    assert.ok(!json.includes("conn-unknown"), "connection leaked in plan");
    assert.ok(!json.includes("profile-a"), "physical ID leaked in plan");

    const sanitized = sanitizePortableTransferPlan(structuredClone(plan), resolver as never);
    const sanitizedJson = JSON.stringify(sanitized);
    assert.ok(!sanitizedJson.includes("stale-unknown"));
    assert.ok(!sanitizedJson.includes("entry-unknown"));
    assert.ok(!sanitizedJson.includes("conn-unknown"));
    // Fail-closed unconfigured portable block: no raw config survives.
    assert.deepEqual(
      (sanitized.methods[0].method.blocks[0] as never as { plugin: { configuration: unknown } })
        .plugin.configuration,
      {},
    );

    const exported = serializePortableMethodTransfer(structuredClone(plan), resolver as never);
    assert.ok(!exported.includes("stale-unknown"));

    for (const file of [
      serializeMethodFile(source.name, source, [], resolver as never),
      serializeMethodPackFile("Pacote", "Canal", [source], [], undefined, resolver as never),
    ]) {
      assert.ok(!file.includes("stale-unknown"), "file export leaked raw URL");
      assert.ok(!file.includes("entry-unknown"));
      assert.ok(!file.includes("conn-unknown"));
    }
  });

  test(`unknown plugin package create/read fail-closes with policy ${withPolicy ? "present" : "absent"}`, async () => {
    const manifest = {
      format: "contentflow-method-pack",
      methods: [
        {
          method: {
            processType: "script",
            blocks: [
              {
                plugin: {
                  pluginId: "com.example.unknown",
                  configuration: {
                    model: "best",
                    projectUrl: "https://flow.example.com/p/stale-unknown",
                  },
                  connectionId: "conn-unknown",
                  ...(withPolicy
                    ? {
                        profileExecution: {
                          mode: "fallback",
                          profileIds: ["profile-a"],
                          projectSelections: { "profile-a": "entry-unknown" },
                        },
                      }
                    : {}),
                },
              },
            ],
          },
        },
      ],
    } as never;
    const sanitized = sanitizePortableManifestBlocks(structuredClone(manifest), resolver as never);
    const json = JSON.stringify(sanitized);
    assert.ok(!json.includes("stale-unknown"));
    assert.ok(!json.includes("entry-unknown"));
    assert.ok(!json.includes("conn-unknown"));
    assert.ok(!json.includes("profile-a"));

    const packed = await createMethodPackage(JSON.stringify(manifest), undefined, resolver as never);
    const restored = await readMethodPackage(packed, undefined, resolver as never);
    assert.ok(!restored.includes("stale-unknown"));
    assert.ok(!restored.includes("entry-unknown"));
    assert.ok(!restored.includes("conn-unknown"));
  });
}

test("known unrelated plugin preserves unrelated keys; resolver-free legacy preserves config but drops IDs", () => {
  const source = {
    contractVersion: 3,
    name: "Método",
    processType: "script",
    blocks: [
      {
        id: "block-1",
        type: "CRIAR",
        operator: "Código",
        name: "Criar",
        order: 0,
        parameters: [],
        plugin: {
          pluginId: "com.example.unrelated",
          pluginVersion: "1.0.0",
          capabilityId: "cap",
          configuration: { model: "best", notes: "keep" },
          connectionId: "conn-local",
          profileExecution: { mode: "fallback", profileIds: ["profile-a"] },
        },
      },
    ],
  } as unknown as ProcessMethod;
  const plan = planPortableMethodTransfer({
    name: "Pacote",
    channelName: "Canal",
    primaryProcessTypes: ["script"],
    processOrder: [
      "script",
      "title",
      "thumbnail",
      "narration",
      "assets",
      "editing",
      "publishing",
      "theme",
    ],
    sourceMethods: [source],
    collections: [],
    items: [],
    includeItems: false,
    profileSetupForPlugin: resolver as never,
  });
  const config = (plan.methods[0].method.blocks[0] as never as { plugin: { configuration: Record<string, unknown> } })
    .plugin.configuration;
  assert.equal(config.model, "best");
  assert.equal(config.notes, "keep");

  // Resolver omitted: universal ID stripping still applies, config preserved (documented limit).
  const manifest = {
    format: "contentflow-method-pack",
    methods: [
      {
        method: {
          processType: "script",
          blocks: [
            {
              plugin: {
                pluginId: "com.example.unknown",
                configuration: { model: "best" },
                connectionId: "conn-local",
                profileExecution: { mode: "fallback", profileIds: ["profile-a"] },
              },
            },
          ],
        },
      },
    ],
  } as never;
  const stripped = sanitizePortableManifestBlocks(structuredClone(manifest), undefined);
  const out = JSON.stringify(stripped);
  assert.ok(!out.includes("conn-local"));
  assert.ok(!out.includes("profile-a"));
  assert.ok(out.includes("best"));
});

test("known non-profile plugin preserves sentinel config; unavailable same shape strips; profile-bound strips URL/IDs", async () => {
  const sentinel = {
    model: "sentinel-plain-keep",
    projectUrl: "https://flow.example.com/p/sentinel-same-shape",
    notes: "sentinel-notes",
  };
  function methodFor(pluginId: string): ProcessMethod {
    return {
      contractVersion: 3,
      name: "Método",
      processType: "script",
      blocks: [
        {
          id: "block-1",
          type: "CRIAR",
          operator: "Código",
          name: "Criar",
          order: 0,
          parameters: [],
          plugin: {
            pluginId,
            pluginVersion: "1.0.0",
            capabilityId: "cap",
            configuration: { ...sentinel },
            connectionId: "conn-sentinel",
            profileExecution: { mode: "fallback", profileIds: ["profile-a"] },
          },
        },
      ],
    } as unknown as ProcessMethod;
  }
  const order = [
    "script",
    "title",
    "thumbnail",
    "narration",
    "assets",
    "editing",
    "publishing",
    "theme",
  ] as never;
  // Actual wiring: plan + re-sanitize + file exports preserve known plain.
  const plainPlan = planPortableMethodTransfer({
    name: "Pacote",
    channelName: "Canal",
    primaryProcessTypes: ["script"],
    processOrder: order,
    sourceMethods: [methodFor("com.example.plain")],
    collections: [],
    items: [],
    includeItems: false,
    profileSetupForPlugin: resolver as never,
  });
  const plainConfig = (
    plainPlan.methods[0].method.blocks[0] as never as {
      plugin: { configuration: Record<string, unknown> };
    }
  ).plugin.configuration;
  assert.equal(plainConfig.model, "sentinel-plain-keep");
  assert.equal(plainConfig.notes, "sentinel-notes");
  assert.equal(plainConfig.projectUrl, "https://flow.example.com/p/sentinel-same-shape");
  const plainResanitized = sanitizePortableTransferPlan(
    structuredClone(plainPlan),
    resolver as never,
  );
  const plainJson = JSON.stringify(plainResanitized);
  assert.ok(plainJson.includes("sentinel-plain-keep"));
  assert.ok(plainJson.includes("sentinel-same-shape"));
  assert.ok(!plainJson.includes("conn-sentinel"));
  assert.ok(!plainJson.includes("profile-a"));
  for (const file of [
    serializeMethodFile("Método", methodFor("com.example.plain"), [], resolver as never),
    serializeMethodPackFile(
      "Pacote",
      "Canal",
      [methodFor("com.example.plain")],
      [],
      undefined,
      resolver as never,
    ),
  ]) {
    assert.ok(file.includes("sentinel-plain-keep"));
    assert.ok(file.includes("sentinel-same-shape"));
    assert.ok(!file.includes("conn-sentinel"));
  }

  // Actual wiring: same shape for unavailable plugin fail-closes to unconfigured.
  const unknownPlan = planPortableMethodTransfer({
    name: "Pacote",
    channelName: "Canal",
    primaryProcessTypes: ["script"],
    processOrder: order,
    sourceMethods: [methodFor("com.example.unknown")],
    collections: [],
    items: [],
    includeItems: false,
    profileSetupForPlugin: resolver as never,
  });
  assert.deepEqual(
    (
      unknownPlan.methods[0].method.blocks[0] as never as {
        plugin: { configuration: unknown };
      }
    ).plugin.configuration,
    {},
  );
  assert.ok(!JSON.stringify(unknownPlan).includes("sentinel-plain-keep"));

  // Actual wiring: profile-bound plugin strips owned URL/IDs but keeps ordinary keys.
  const boundPlan = planPortableMethodTransfer({
    name: "Pacote",
    channelName: "Canal",
    primaryProcessTypes: ["script"],
    processOrder: order,
    sourceMethods: [methodFor("com.example.flow")],
    collections: [],
    items: [],
    includeItems: false,
    profileSetupForPlugin: resolver as never,
  });
  const boundConfig = (
    boundPlan.methods[0].method.blocks[0] as never as {
      plugin: { configuration: Record<string, unknown> };
    }
  ).plugin.configuration;
  assert.equal(boundConfig.model, "sentinel-plain-keep");
  assert.equal(boundConfig.notes, "sentinel-notes");
  assert.equal((boundConfig as Record<string, unknown>).projectUrl, undefined);
  assert.ok(!JSON.stringify(boundPlan).includes("conn-sentinel"));

  // Package wiring mirrors the same three outcomes.
  const manifestFor = (pluginId: string) =>
    ({
      format: "contentflow-method-pack",
      methods: [
        {
          method: {
            processType: "script",
            blocks: [
              {
                plugin: {
                  pluginId,
                  configuration: { ...sentinel },
                  connectionId: "conn-sentinel",
                  profileExecution: { mode: "fallback", profileIds: ["profile-a"] },
                },
              },
            ],
          },
        },
      ],
    }) as never;
  const plainPkg = sanitizePortableManifestBlocks(
    structuredClone(manifestFor("com.example.plain")),
    resolver as never,
  );
  assert.ok(JSON.stringify(plainPkg).includes("sentinel-plain-keep"));
  const unknownPkg = sanitizePortableManifestBlocks(
    structuredClone(manifestFor("com.example.unknown")),
    resolver as never,
  );
  assert.deepEqual(
    (unknownPkg.methods as never as Array<{ method: { blocks: Array<{ plugin: { configuration: unknown } }> } }>)[0].method
      .blocks[0].plugin.configuration,
    {},
  );
  const packedUnknown = await createMethodPackage(
    JSON.stringify(manifestFor("com.example.unknown")),
    undefined,
    resolver as never,
  );
  const restoredUnknown = await readMethodPackage(packedUnknown, undefined, resolver as never);
  assert.ok(!restoredUnknown.includes("sentinel-plain-keep"));

  // Import path: unknown never counts as known; plain keeps ordinary config minus IDs.
  const importedPlain = clearImportedProfileAssociations({
    blocks: methodFor("com.example.plain").blocks as never,
    profileSetupForPlugin: resolver as never,
  });
  assert.equal(
    (importedPlain[0].plugin as never as { configuration: Record<string, unknown> }).configuration
      .model,
    "sentinel-plain-keep",
  );
  assert.equal(importedPlain[0].plugin?.profileExecution, undefined);
  const importedUnknown = clearImportedProfileAssociations({
    blocks: methodFor("com.example.unknown").blocks as never,
    profileSetupForPlugin: resolver as never,
  });
  assert.deepEqual(
    (importedUnknown[0].plugin as never as { configuration: unknown }).configuration,
    {},
  );
});
