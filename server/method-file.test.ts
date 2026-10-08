import assert from "node:assert/strict";
import test from "node:test";
import type {
  ActionBlock,
  Channel,
  ProcessMethod,
  StrategicCollection,
  ValueShape,
} from "../src/lib/domain";
import {
  collectMethodRequirements,
  copyImportedBlocks,
  copyImportedMethods,
  parseMethodFile,
  parseMethodImportFile,
  planPortableMethodTransfer,
  serializeMethodFile,
  serializeMethodPackFile,
  serializePortableMethodTransfer,
} from "../src/lib/method-file";
import { areInputShapesCompatible } from "../src/lib/data-shape";
import { validateBuilderMethods, type BuilderPluginContext } from "./builder-methods";
import type { RegisteredPlugin } from "./plugin-runner";

const textOne: ValueShape = {
  kind: "content",
  family: "text",
  cardinality: "one",
  representation: "inline",
};
const textMany: ValueShape = {
  kind: "content",
  family: "text",
  cardinality: "many",
  representation: "inline",
};
const imageMany: ValueShape = {
  kind: "content",
  family: "image",
  cardinality: "many",
  representation: "artifact",
};

function method(
  blocks: ActionBlock[],
  processType: ProcessMethod["processType"] = "script",
): ProcessMethod {
  return { contractVersion: 3, name: `Método ${processType}`, processType, blocks };
}

function humanBlock(): ActionBlock {
  return {
    id: "create",
    type: "CRIAR",
    operator: "Humano",
    name: "Criar",
    order: 0,
    parameters: [],
    inputs: [
      { id: "runtime", label: "Referências", shape: imageMany, binding: { kind: "runtime" } },
    ],
    outputs: [{ id: "script", key: "script", label: "Roteiro", shape: textOne, required: true }],
  };
}

test("round-trip individual preserva somente o contrato canônico v3", () => {
  const source = method([humanBlock()]);
  const json = serializeMethodFile(source.name, source);
  const parsed = parseMethodFile(json);
  assert.equal(parsed.version, 3);
  assert.equal(parsed.method.contractVersion, 3);
  assert.deepEqual(parsed.method.blocks[0].inputs?.[0].shape, imageMany);
  assert.deepEqual(parsed.method.blocks[0].inputs?.[0].binding, { kind: "runtime" });
  assert.deepEqual(parsed.method.blocks[0].outputs?.[0].shape, textOne);
});

test("arquivo v1 é inválido e não recebe adapter", () => {
  assert.throws(
    () =>
      parseMethodFile(
        JSON.stringify({
          format: "contentflow-method",
          version: 1,
          name: "Antigo",
          method: { processType: "script", blocks: [] },
        }),
      ),
    /não é um arquivo de método válido/i,
  );
});

test("exportação de plugin remove vínculo e política locais sem alterar capability", () => {
  const source = method([
    {
      ...humanBlock(),
      operator: "IA",
      plugin: {
        pluginId: "com.example.writer",
        pluginVersion: "2.0.0",
        capabilityId: "write",
        configuration: { model: "best" },
        connectionId: "local-account",
        connectionRequired: true,
        profileExecution: { mode: "single", profileIds: ["private-profile"] },
      },
    },
  ]);
  const parsed = parseMethodFile(serializeMethodFile(source.name, source));
  const plugin = parsed.method.blocks[0].plugin!;
  assert.equal(plugin.pluginId, "com.example.writer");
  assert.equal(plugin.capabilityId, "write");
  assert.equal(plugin.connectionId, undefined);
  assert.equal(plugin.profileExecution, undefined);
  assert.equal(plugin.connectionRequired, true);
});

test("cópia remapeia IDs e bindings entre blocos", () => {
  const first = humanBlock();
  const second: ActionBlock = {
    id: "review",
    type: "VALIDAR",
    operator: "Humano",
    name: "Revisar",
    order: 1,
    parameters: [],
    inputs: [
      {
        id: "review-input",
        label: "Roteiro",
        shape: textOne,
        binding: { kind: "previous_block", blockId: first.id, outputKey: "script" },
      },
    ],
    outputs: [
      {
        id: "decision",
        key: "decision",
        label: "Decisão",
        shape: { kind: "control", control: "approval", cardinality: "one" },
        required: true,
      },
    ],
    validation: {
      mode: "approval",
      onReject: "retry_target",
      targetBlockId: first.id,
      maxAttempts: 3,
      retryMode: "full",
    },
  };
  let sequence = 0;
  const copied = copyImportedBlocks(
    "script",
    [first, second],
    (prefix) => `${prefix}-${++sequence}`,
  );
  const sourceId = copied[0].id;
  assert.notEqual(sourceId, first.id);
  assert.deepEqual(copied[1].inputs?.[0].binding, {
    kind: "previous_block",
    blockId: sourceId,
    outputKey: "script",
  });
  assert.equal(copied[1].validation?.targetBlockId, sourceId);
});

test("cópia multiprocesso remapeia continuidade de conversa", () => {
  const source = method([
    {
      ...humanBlock(),
      operator: "IA",
      plugin: {
        pluginId: "browser",
        capabilityId: "write",
        configuration: {},
        conversation: { mode: "new" },
      },
    },
  ]);
  const target = method(
    [
      {
        ...humanBlock(),
        id: "validate",
        operator: "IA",
        plugin: {
          pluginId: "browser",
          capabilityId: "validate",
          configuration: {},
          conversation: { mode: "reuse", sourceProcessType: "script", sourceBlockId: "create" },
        },
      },
    ],
    "title",
  );
  let sequence = 0;
  const copied = copyImportedMethods([source, target], (prefix) => `${prefix}-${++sequence}`);
  assert.equal(copied[1].blocks[0].plugin?.conversation?.mode, "reuse");
  if (copied[1].blocks[0].plugin?.conversation?.mode === "reuse") {
    assert.equal(copied[1].blocks[0].plugin?.conversation.sourceBlockId, copied[0].blocks[0].id);
  }
});

test("ESCOLHER exporta requisito de coleção sem ID local", () => {
  const collection: StrategicCollection = {
    id: "local-collection",
    channelId: "channel",
    name: "Ângulos",
    fields: [{ id: "angle", label: "Ângulo", shape: textOne, required: true }],
    createdAt: "2026-09-30T00:00:00.000Z",
  };
  const source = method(
    [
      {
        id: "choose",
        type: "ESCOLHER",
        operator: "Humano",
        name: "Escolher",
        collectionId: collection.id,
        order: 0,
        parameters: [],
        outputs: [
          { id: "selected", key: "selected", label: "Escolha", shape: textOne, required: true },
        ],
      },
    ],
    "title",
  );
  const parsed = parseMethodFile(serializeMethodFile(source.name, source, [collection]));
  assert.equal(parsed.method.blocks[0].collectionId, undefined);
  assert.deepEqual(parsed.requirements, collectMethodRequirements(source, [collection]));
  assert.equal(parsed.requirements[0]?.kind, "collection");
});

test("pack v3 preserva nomes e contratos de todos os Métodos", () => {
  const script = method([humanBlock()]);
  const title = method(
    [
      {
        ...humanBlock(),
        id: "title",
        outputs: [
          { id: "titles", key: "titles", label: "Títulos", shape: textMany, required: true },
        ],
      },
    ],
    "title",
  );
  const parsed = parseMethodImportFile(serializeMethodPackFile("Pacote", "Canal", [script, title]));
  assert.equal(parsed.version, 3);
  assert.ok("methods" in parsed);
  if ("methods" in parsed) {
    const methods = parsed.methods.map((entry) => ("method" in entry ? entry.method : entry));
    assert.deepEqual(
      methods.map((entry) => entry.processType),
      ["script", "title"],
    );
    assert.ok(methods.every((entry) => entry.contractVersion === 3));
  }
});

test("transferência portátil v3 inclui dependências e omite itens por padrão", () => {
  const script = method([humanBlock()]);
  const title = method(
    [
      {
        ...humanBlock(),
        id: "title",
        inputs: [
          {
            id: "script-input",
            label: "Roteiro",
            shape: textOne,
            binding: { kind: "previous_process", processType: "script", outputKey: "script" },
          },
        ],
      },
    ],
    "title",
  );
  const plan = planPortableMethodTransfer({
    name: "Título",
    channelName: "Canal",
    primaryProcessTypes: ["title"],
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
    sourceMethods: [script, title],
    collections: [],
    items: [],
    includeItems: false,
  });
  assert.deepEqual(
    plan.methods.map((entry) => entry.method.processType),
    ["script", "title"],
  );
  assert.equal(plan.itemsIncluded, false);
  assert.deepEqual(plan.items, []);
  const parsed = parseMethodImportFile(serializePortableMethodTransfer(plan));
  assert.equal(parsed.version, 3);
  assert.ok("methods" in parsed);
});

function internalReceiptShape(): ValueShape {
  return {
    kind: "record",
    cardinality: "one",
    fields: [
      {
        id: "fld-title",
        label: "Title",
        key: "title",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        required: true,
      },
      {
        id: "fld-count",
        label: "Count",
        key: "count",
        shape: { kind: "control", control: "number", cardinality: "one" },
        required: true,
      },
      {
        id: "fld-flag",
        label: "Flag",
        key: "flag",
        shape: { kind: "control", control: "boolean", cardinality: "one" },
        required: false,
      },
    ],
  };
}

function recordPluginContext(): BuilderPluginContext {
  const receipt = internalReceiptShape();
  const plugin: RegisteredPlugin = {
    id: "test.internal.record",
    source: "local",
    directory: "record-test",
    absoluteDirectory: "record-test",
    entrypoint: "index.mjs",
    executable: true,
    manifest: {
      apiVersion: "2",
      id: "test.internal.record",
      name: "Record test",
      version: "1.0.0",
      description: "Fixture",
      author: "ContentFlow",
      license: "proprietary",
      runtime: { kind: "node", version: ">=26", module: "esm" },
      entrypoint: "index.mjs",
      permissions: [],
      capabilities: [
        {
          id: "make-receipt",
          operator: "IA",
          blockTypes: ["CRIAR"],
          processTypes: ["script"],
          inputPorts: [],
          outputPorts: [
            {
              key: "out-receipt",
              label: "Receipt",
              shape: structuredClone(receipt),
              required: true,
              internal: true,
            },
          ],
          execution: { mode: "immediate" },
          sideEffects: [],
          cost: { model: "free", estimateSupported: false },
          dataPolicy: { sendsDataToThirdParties: false },
          blockConfigSchema: { type: "object", properties: {}, additionalProperties: false },
          outputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
        {
          id: "use-receipt",
          operator: "IA",
          blockTypes: ["CRIAR"],
          processTypes: ["script"],
          inputPorts: [
            {
              key: "in-receipt",
              label: "Receipt",
              shape: structuredClone(receipt),
              required: true,
              internal: true,
            },
          ],
          outputPorts: [
            {
              key: "script",
              label: "Script",
              shape: structuredClone(textOne),
              required: true,
            },
          ],
          execution: { mode: "immediate" },
          sideEffects: [],
          cost: { model: "free", estimateSupported: false },
          dataPolicy: { sendsDataToThirdParties: false },
          blockConfigSchema: { type: "object", properties: {}, additionalProperties: false },
          outputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
      ],
    },
  };
  return { plugin, enabled: true, connections: [], profiles: [] };
}

function recordProducerConsumerBlocks(): ActionBlock[] {
  const receiptForOutput = internalReceiptShape();
  const receiptForInput = structuredClone(receiptForOutput);
  return [
    {
      id: "produce",
      type: "CRIAR",
      operator: "IA",
      name: "Produce",
      order: 0,
      parameters: [],
      inputs: [],
      outputs: [
        {
          id: "prod-out",
          label: "Receipt",
          key: "receipt",
          shape: receiptForOutput,
          required: true,
          portKey: "out-receipt",
        },
      ],
      plugin: {
        pluginId: "test.internal.record",
        capabilityId: "make-receipt",
        configuration: {},
      },
    },
    {
      id: "consume",
      type: "CRIAR",
      operator: "IA",
      name: "Consume",
      order: 1,
      parameters: [],
      inputs: [
        {
          id: "cons-in",
          label: "Receipt",
          shape: receiptForInput,
          binding: { kind: "previous_block", blockId: "produce", outputKey: "receipt" },
          portKey: "in-receipt",
        },
      ],
      outputs: [
        {
          id: "cons-out",
          label: "Script",
          key: "script",
          shape: structuredClone(textOne),
          required: true,
          portKey: "script",
        },
      ],
      plugin: {
        pluginId: "test.internal.record",
        capabilityId: "use-receipt",
        configuration: {},
      },
    },
  ];
}

test("importação preserva shape record fechado de porta plugin explícita e continua válida", () => {
  const plugins = [recordPluginContext()];
  const channel = { id: "channel-1", name: "Canal", handle: "@c", niche: "Edu", language: "pt-BR", methods: {} } as Channel;
  const source = method(recordProducerConsumerBlocks(), "script");
  const sourceSnapshot = structuredClone(source.blocks);

  const sourceCheck = validateBuilderMethods({
    channel,
    methods: { script: structuredClone(source) },
    plugins,
    collections: [],
  });
  assert.equal(sourceCheck.ok, true, sourceCheck.errors.join("\n"));

  const parsed = parseMethodFile(serializeMethodFile(source.name, source));
  let sequence = 0;
  const copied = copyImportedBlocks(parsed.method.processType, parsed.method.blocks, (prefix) => `${prefix}-${++sequence}`);

  const copiedProducerOutput = copied[0].outputs?.[0];
  const copiedConsumerInput = copied[1].inputs?.[0];
  const sourceProducerOutput = sourceSnapshot[0].outputs?.[0];
  const sourceConsumerInput = sourceSnapshot[1].inputs?.[0];
  assert.ok(copiedProducerOutput && copiedConsumerInput && sourceProducerOutput && sourceConsumerInput);
  assert.deepEqual(copiedProducerOutput.shape, sourceProducerOutput.shape);
  assert.deepEqual(copiedConsumerInput.shape, sourceConsumerInput.shape);
  assert.deepEqual(copiedProducerOutput.shape, copiedConsumerInput.shape);
  assert.deepEqual(
    (copiedProducerOutput.shape as { fields: Array<{ id: string }> }).fields.map((field) => field.id),
    ["fld-title", "fld-count", "fld-flag"],
  );
  assert.notEqual(copied[0].id, sourceSnapshot[0].id);
  assert.notEqual(copied[1].id, sourceSnapshot[1].id);
  assert.notEqual(copiedProducerOutput.id, sourceProducerOutput.id);
  assert.notEqual(copiedConsumerInput.id, sourceConsumerInput.id);
  assert.notEqual(
    copied[0].outputs?.[0],
    source.blocks[0].outputs?.[0],
  );
  assert.equal(
    areInputShapesCompatible(copiedProducerOutput.shape, copiedConsumerInput.shape),
    true,
  );

  const copiedMethod = method(copied, "script");
  const copiedCheck = validateBuilderMethods({
    channel,
    methods: { script: copiedMethod },
    plugins,
    collections: [],
  });
  assert.equal(copiedCheck.ok, true, copiedCheck.errors.join("\n"));

  assert.deepEqual(source.blocks, sourceSnapshot);
});

test("mesma cópia com field IDs remapeados falha na porta interna exata", () => {
  const plugins = [recordPluginContext()];
  const channel = { id: "channel-1", name: "Canal", handle: "@c", niche: "Edu", language: "pt-BR", methods: {} } as Channel;
  const source = method(recordProducerConsumerBlocks(), "script");
  const parsed = parseMethodFile(serializeMethodFile(source.name, source));
  let sequence = 0;
  const copied = copyImportedBlocks(parsed.method.processType, parsed.method.blocks, (prefix) => `${prefix}-${++sequence}`);
  const broken = structuredClone(copied);
  let brokenSequence = 10_000;
  for (const block of broken) {
    for (const input of block.inputs ?? []) {
      if (input.shape.kind === "record") {
        for (const field of input.shape.fields) field.id = `broken-field-${++brokenSequence}`;
      }
    }
    for (const output of block.outputs ?? []) {
      if (output.shape.kind === "record") {
        for (const field of output.shape.fields) field.id = `broken-field-${++brokenSequence}`;
      }
    }
  }
  const brokenProducerOutput = broken[0].outputs?.[0];
  const brokenConsumerInput = broken[1].inputs?.[0];
  assert.ok(brokenProducerOutput && brokenConsumerInput);
  assert.equal(areInputShapesCompatible(brokenProducerOutput.shape, brokenConsumerInput.shape), true);
  const brokenCheck = validateBuilderMethods({
    channel,
    methods: { script: method(broken, "script") },
    plugins,
    collections: [],
  });
  assert.equal(brokenCheck.ok, false);
  assert.match(brokenCheck.errors.join("\n"), /incompatível/);
});

test("cópia remapeia field IDs de record humano sem porta explícita", () => {
  const receipt = internalReceiptShape();
  const human: ActionBlock = {
    id: "human",
    type: "CRIAR",
    operator: "Humano",
    name: "Human",
    order: 0,
    parameters: [],
    inputs: [{ id: "human-in", label: "Data", shape: structuredClone(receipt), binding: { kind: "runtime" } }],
    outputs: [{ id: "human-out", label: "Data", key: "data", shape: structuredClone(receipt), required: true }],
  };
  const snapshot = structuredClone([human]);
  let sequence = 0;
  const copied = copyImportedBlocks("script", [human], (prefix) => `${prefix}-${++sequence}`);
  const copiedInputFields = (copied[0].inputs?.[0].shape as { fields: Array<{ id: string }> }).fields;
  const copiedOutputFields = (copied[0].outputs?.[0].shape as { fields: Array<{ id: string }> }).fields;
  assert.ok(copiedInputFields.length === 3 && copiedOutputFields.length === 3);
  for (const field of [...copiedInputFields, ...copiedOutputFields]) {
    assert.ok(!["fld-title", "fld-count", "fld-flag"].includes(field.id));
  }
  assert.deepEqual([human], snapshot);
});
