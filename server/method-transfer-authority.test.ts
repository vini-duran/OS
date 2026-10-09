import assert from "node:assert/strict";
import test from "node:test";
import { authorizeLocalBlockCopy } from "./profile-execution-policy";
import { copyImportedMethods, planPortableMethodTransfer } from "../src/lib/method-file";
import { PROCESS_ORDER, type ActionBlock, type ProcessMethod } from "../src/lib/domain";

const SETUP = {
  configurationKey: "profile",
  label: "Perfil",
  namedUrls: { allowedHosts: ["flow.example.com"], configurationKey: "projectUrl" },
} as never;
const resolver = (pluginId: string) => (pluginId === "com.example.flow" ? (SETUP as never) : undefined);
const noSetupResolver = (pluginId: string) => (pluginId === "com.example.flow" ? null : undefined);

function block(overrides: Record<string, unknown>): ActionBlock {
  return {
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
      configuration: { model: "best" },
      ...overrides,
    },
  } as unknown as ActionBlock;
}

const POLICY = {
  mode: "fallback",
  profileIds: ["profile-a"],
  projectSelections: { "profile-a": "entry-real" },
};

test("legitimate internal copy preserves selection and authoritative connection", () => {
  const actual = block({
    configuration: { model: "best", projectUrl: "https://flow.example.com/p/real" },
    connectionId: "conn-real",
    profileExecution: structuredClone(POLICY),
  });
  const supplied = structuredClone(actual);
  const copied = structuredClone(actual);
  const out = authorizeLocalBlockCopy({
    actualBlock: actual,
    suppliedBlock: supplied,
    copiedBlock: copied,
    profileSetupForPlugin: resolver as never,
  });
  assert.deepEqual(out.plugin?.profileExecution, POLICY);
  assert.equal(out.plugin?.connectionId, "conn-real");
});

test("proven policy with forged connection adopts authoritative handle", () => {
  const actual = block({
    configuration: { model: "best", projectUrl: "https://flow.example.com/p/real" },
    connectionId: "conn-real",
    profileExecution: structuredClone(POLICY),
  });
  const supplied = block({
    configuration: { model: "best", projectUrl: "https://flow.example.com/p/real" },
    connectionId: "conn-forged",
    profileExecution: structuredClone(POLICY),
  });
  const copied = structuredClone(supplied);
  const out = authorizeLocalBlockCopy({
    actualBlock: actual,
    suppliedBlock: supplied,
    copiedBlock: copied,
    profileSetupForPlugin: resolver as never,
  });
  assert.equal(out.plugin?.connectionId, "conn-real");
  assert.deepEqual(out.plugin?.profileExecution, POLICY);
});

test("legitimate policy-free internal copy preserves ordinary settings and actual connection", () => {
  const actual = block({
    configuration: { endpoint: "https://service.example.test", model: "actual" },
    connectionId: "conn-actual",
  });
  const supplied = block({
    configuration: { endpoint: "https://service.example.test", model: "forged" },
    connectionId: "conn-forged",
  });
  const copied = { ...structuredClone(supplied), id: "remapped-block" };
  const out = authorizeLocalBlockCopy({
    actualBlock: actual,
    suppliedBlock: supplied,
    copiedBlock: copied,
    profileSetupForPlugin: noSetupResolver as never,
  });
  assert.equal(out.plugin?.connectionId, "conn-actual");
  assert.deepEqual(out.plugin?.configuration, actual.plugin?.configuration);
});

test("portable local-copy pipeline authorizes canonical process/index key with distinct source IDs", () => {
  const sourcePlugin = {
    ...block({
    configuration: { model: "source-config", projectUrl: "https://flow.example.com/p/source" },
    connectionId: "conn-actual",
    profileExecution: structuredClone(POLICY),
    }),
    id: "original-source-block-id",
    order: 1,
  };
  const sourceMethod: ProcessMethod = {
    contractVersion: 3,
    name: "Método local",
    processType: "title",
    blocks: [
      {
        id: "preceding-human-block",
        type: "CRIAR",
        operator: "Humano",
        name: "Anterior",
        order: 0,
        parameters: [],
      },
      sourcePlugin,
    ],
  };
  const plan = planPortableMethodTransfer({
    name: sourceMethod.name,
    channelName: "Canal",
    sourceMethods: [sourceMethod],
    processOrder: [...PROCESS_ORDER],
    primaryProcessTypes: ["title"],
    preserveLocalConnections: true,
  });
  const suppliedMethod = plan.methods[0].method;
  const expectedPortableBlockId = "title:block:2";
  assert.equal(suppliedMethod.blocks[1].id, expectedPortableBlockId);
  assert.notEqual(suppliedMethod.blocks[1].id, sourcePlugin.id);

  // Exercise the same remapping boundary as /api/method-transfers/apply.
  const [copiedMethod] = copyImportedMethods([suppliedMethod], (prefix) => `${prefix}-new`, {
    preserveLocalConnections: true,
    remapLocalProfileExecution: (_pluginId, policy) => structuredClone(policy),
  });
  assert.notEqual(copiedMethod.blocks[1].id, suppliedMethod.blocks[1].id);
  if (copiedMethod.blocks[1].plugin) copiedMethod.blocks[1].plugin.connectionId = "conn-forged";

  const authorized = authorizeLocalBlockCopy({
    actualBlock: sourceMethod.blocks[1],
    suppliedBlock: suppliedMethod.blocks[1],
    copiedBlock: copiedMethod.blocks[1],
    expectedPortableBlockId,
    profileSetupForPlugin: resolver as never,
  });
  assert.equal(authorized.plugin?.connectionId, "conn-actual");
  assert.deepEqual(authorized.plugin?.profileExecution, POLICY);
});

test("existing channel but no-policy forged block strips connection and managed URL", () => {
  const actual = block({
    configuration: { model: "best" },
    connectionId: undefined,
    profileExecution: undefined,
  });
  const supplied = block({
    configuration: { model: "best", projectUrl: "https://flow.example.com/p/forged" },
    connectionId: "conn-forged",
    profileExecution: undefined,
  });
  const copied = structuredClone(supplied);
  const out = authorizeLocalBlockCopy({
    actualBlock: actual,
    suppliedBlock: supplied,
    copiedBlock: copied,
    profileSetupForPlugin: resolver as never,
  });
  assert.equal(out.plugin?.profileExecution, undefined);
  assert.equal(out.plugin?.connectionId, undefined);
  assert.ok(!("projectUrl" in (out.plugin?.configuration ?? {})));
});

test("mismatched plugin/capability strips even with matching policy JSON", () => {
  const actual = block({
    configuration: { model: "best", projectUrl: "https://flow.example.com/p/real" },
    connectionId: "conn-real",
    profileExecution: structuredClone(POLICY),
  });
  const supplied = block({
    pluginId: "com.example.other",
    configuration: { model: "best", projectUrl: "https://flow.example.com/p/real" },
    connectionId: "conn-forged",
    profileExecution: structuredClone(POLICY),
  });
  const copied = structuredClone(supplied);
  const out = authorizeLocalBlockCopy({
    actualBlock: actual,
    suppliedBlock: supplied,
    copiedBlock: copied,
    profileSetupForPlugin: resolver as never,
  });
  assert.equal(out.plugin?.profileExecution, undefined);
  assert.equal(out.plugin?.connectionId, undefined);
});

test("dropped invalid policy (remap cleared) strips connection", () => {
  const actual = block({
    configuration: { model: "best", projectUrl: "https://flow.example.com/p/real" },
    connectionId: "conn-real",
    profileExecution: structuredClone(POLICY),
  });
  const supplied = block({
    configuration: { model: "best", projectUrl: "https://flow.example.com/p/real" },
    connectionId: "conn-forged",
    profileExecution: structuredClone(POLICY),
  });
  // Remap validation dropped the policy (invalid binding): copied has none.
  const copied = block({
    configuration: { model: "best", projectUrl: "https://flow.example.com/p/real" },
    connectionId: "conn-forged",
    profileExecution: undefined,
  });
  const out = authorizeLocalBlockCopy({
    actualBlock: actual,
    suppliedBlock: supplied,
    copiedBlock: copied,
    profileSetupForPlugin: resolver as never,
  });
  assert.equal(out.plugin?.profileExecution, undefined);
  assert.equal(out.plugin?.connectionId, undefined);
  assert.ok(!("projectUrl" in (out.plugin?.configuration ?? {})));
});

test("mismatched source block id cannot authorize a policy-free connection", () => {
  const actual = block({ connectionId: "conn-actual" });
  const supplied = { ...structuredClone(actual), id: "different-source-block" };
  const copied = { ...structuredClone(supplied), id: "remapped-block", plugin: { ...supplied.plugin!, connectionId: "conn-forged" } };
  const out = authorizeLocalBlockCopy({
    actualBlock: actual,
    suppliedBlock: supplied,
    copiedBlock: copied,
    profileSetupForPlugin: noSetupResolver as never,
  });
  assert.equal(out.plugin?.connectionId, undefined);
});
