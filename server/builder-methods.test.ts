import assert from "node:assert/strict";
import test from "node:test";
import type { Channel, ProcessMethod, ValueShape } from "../src/lib/domain";
import type { RegisteredPlugin } from "./plugin-runner";
import { validatePluginManifest } from "./plugin-validation";
import {
  BUILDER_METHOD_CONTRACT,
  type BuilderPluginContext,
  validateBuilderMethods,
} from "./builder-methods";

const channel = {
  id: "channel-1",
  name: "Canal de teste",
  handle: "@teste",
  niche: "Educação",
  language: "pt-BR",
  methods: {},
} as Channel;

test("builder contract exposes separate canonical image and video asset outputs", () => {
  assert.deepEqual(
    BUILDER_METHOD_CONTRACT.processOutputs.assets.map((output) => output.key),
    ["images", "videos"],
  );
  assert.match(BUILDER_METHOD_CONTRACT.strategyGuidance.example, /CRIAR images/);
  assert.match(BUILDER_METHOD_CONTRACT.strategyGuidance.layerResponsibilities.core, /work units/);
  assert.ok(
    BUILDER_METHOD_CONTRACT.strategyGuidance.avoidExtraBlocksFor.some((item) =>
      item.includes("perfis"),
    ),
  );
});

function manualThemeMethod(): ProcessMethod {
  return {
    contractVersion: 3,
    name: "Tema manual",
    processType: "theme",
    blocks: [
      {
        id: "theme-input",
        type: "CRIAR",
        operator: "Humano",
        name: "Inserir tema",
        instructions: "Insira o tema definido externamente.",
        inputs: [],
        outputs: [
          {
            id: "theme-output",
            label: "Tema final",
            key: "theme",
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            required: true,
          },
        ],
        parameters: [],
        order: 0,
      },
    ],
  };
}

function pluginContext(
  inputPortKeys: string[],
  outputPortKeys: string[] = ["theme"],
): BuilderPluginContext {
  const plugin: RegisteredPlugin = {
    id: "dev.contentflow.port-test",
    source: "local",
    directory: "port-test",
    absoluteDirectory: "C:/plugins/port-test",
    entrypoint: "index.mjs",
    executable: true,
    manifest: {
      apiVersion: "2",
      id: "dev.contentflow.port-test",
      name: "Port test",
      version: "1.0.0",
      description: "Fixture",
      author: "ContentFlow",
      license: "proprietary",
      runtime: { kind: "node", version: ">=26", module: "esm" },
      entrypoint: "index.mjs",
      permissions: [],
      capabilities: [
        {
          id: "create-theme",
          operator: "IA",
          blockTypes: ["CRIAR"],
          processTypes: ["theme"],
          inputPorts: inputPortKeys.map((key) => ({
            key,
            label: key,
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            required: false,
          })),
          outputPorts: outputPortKeys.map((key) => ({
            key,
            label: key,
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            required: key === "theme",
          })),
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

function pluginThemeMethod(): ProcessMethod {
  const method = manualThemeMethod();
  method.blocks[0] = {
    ...method.blocks[0],
    operator: "IA",
    inputs: [
      {
        id: "section-count",
        label: "Quantidade de blocos",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        binding: { kind: "static", value: "1" },
      },
    ],
    outputs: method.blocks[0].outputs?.map((output) => ({ ...output, portKey: "theme" })),
    plugin: {
      pluginId: "dev.contentflow.port-test",
      capabilityId: "create-theme",
      configuration: {},
    },
  };
  return method;
}

function validationPluginContext(inputPortKeys: string[]): BuilderPluginContext {
  const base = pluginContext([]);
  base.plugin.manifest.capabilities = [
    {
      id: "validate-theme",
      operator: "IA",
      blockTypes: ["VALIDAR"],
      processTypes: ["theme"],
      inputPorts: inputPortKeys.map((key) => ({
        key,
        label: key,
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        required: inputPortKeys.length === 1,
      })),
      outputPorts: [
        {
          key: "decision",
          label: "Decisão",
          shape: { kind: "control", control: "approval", cardinality: "one" },
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
  ];
  return base;
}

function pluginValidationMethod(): ProcessMethod {
  const method = manualThemeMethod();
  method.blocks.push({
    id: "review-theme",
    type: "VALIDAR",
    operator: "IA",
    name: "Revisar tema",
    inputs: [],
    outputs: [
      {
        id: "decision-output",
        label: "Decisão",
        key: "decision",
        shape: { kind: "control", control: "approval", cardinality: "one" },
        required: true,
        portKey: "decision",
      },
    ],
    validation: {
      targetBlockId: "theme-input",
      targetOutputKey: "theme",
      mode: "approval",
      onReject: "retry_target",
      maxAttempts: 3,
    },
    plugin: {
      pluginId: "dev.contentflow.port-test",
      capabilityId: "validate-theme",
      configuration: {},
    },
    parameters: [],
    order: 1,
  });
  return method;
}

test("accepts a complete manual Method without requiring a plugin", () => {
  const result = validateBuilderMethods({
    channel,
    methods: { theme: manualThemeMethod() },
    plugins: [],
    collections: [],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.methods?.theme?.blocks[0].operator, "Humano");
});

test("builder accepts JSON as text and rejects new strategic control/record schemas", () => {
  assert.deepEqual(BUILDER_METHOD_CONTRACT.strategicFields.families, [
    "text",
    "image",
    "audio",
    "video",
  ]);
  const method = manualThemeMethod();
  method.blocks[0].outputs![0].shape = {
    kind: "content",
    family: "text",
    cardinality: "one",
    representation: "artifact",
    formats: { mimeTypes: ["application/json"] },
  };
  const validate = () =>
    validateBuilderMethods({ channel, methods: { theme: method }, plugins: [], collections: [] });
  assert.equal(validate().ok, true, validate().errors.join("\n"));
  for (const shape of [
    { kind: "control", control: "number", cardinality: "one" },
    {
      kind: "record",
      cardinality: "many",
      fields: [
        {
          id: "text",
          label: "Text",
          key: "text",
          required: true,
          shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        },
      ],
    },
  ] as const) {
    method.blocks[0].outputs![0].shape = structuredClone(shape) as ValueShape;
    assert.equal(validate().ok, false);
    assert.match(validate().errors.join("\n"), /devem ser conteúdo/);
  }
});

test("builder preserves existing internal fields while editing content", () => {
  const method = manualThemeMethod();
  method.blocks[0].outputs!.push({
    id: "internal",
    key: "internal",
    label: "Internal",
    required: true,
    shape: { kind: "control", control: "number", cardinality: "one" },
  });
  const existingChannel = {
    ...channel,
    methods: { ...channel.methods, theme: structuredClone(method) },
  };
  method.blocks[0].name = "Edited action";
  const result = validateBuilderMethods({
    channel: existingChannel,
    methods: { theme: method },
    plugins: [],
    collections: [],
  });
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.deepEqual(
    result.methods!.theme!.blocks[0].outputs![1].shape,
    method.blocks[0].outputs![1].shape,
  );
  method.blocks[0].outputs![1].shape = { kind: "control", control: "boolean", cardinality: "one" };
  assert.equal(
    validateBuilderMethods({
      channel: existingChannel,
      methods: { theme: method },
      plugins: [],
      collections: [],
    }).ok,
    false,
  );
});

test("rejects unknown universal processes", () => {
  const result = validateBuilderMethods({
    channel,
    methods: { research: { ...manualThemeMethod(), processType: "theme" } },
    plugins: [],
    collections: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Processo universal desconhecido/);
});

test("rejects a previous_block reference to a later block", () => {
  const method = manualThemeMethod();
  method.blocks[0].inputs = [
    {
      id: "future-input",
      label: "Resultado futuro",
      shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
      binding: { kind: "previous_block", blockId: "future-block", outputKey: "future" },
    },
  ];
  method.blocks.push({
    id: "future-block",
    type: "CRIAR",
    operator: "Humano",
    outputs: [
      {
        id: "future-output",
        label: "Futuro",
        key: "future",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        required: true,
      },
    ],
    parameters: [],
    order: 1,
  });
  const result = validateBuilderMethods({
    channel,
    methods: { theme: method },
    plugins: [],
    collections: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /referência inválida/);
});

test("builder validates cross process references against the channel sequence", () => {
  const script: ProcessMethod = {
    ...manualThemeMethod(),
    processType: "script",
    blocks: [
      {
        ...manualThemeMethod().blocks[0],
        id: "script-input",
        outputs: [
          {
            id: "script-output",
            label: "Roteiro",
            key: "script",
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            required: true,
          },
        ],
      },
    ],
  };
  const thumbnail: ProcessMethod = {
    ...manualThemeMethod(),
    processType: "thumbnail",
    blocks: [
      {
        ...manualThemeMethod().blocks[0],
        id: "thumbnail-input",
        inputs: [
          {
            id: "script-reference",
            label: "Roteiro",
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            binding: { kind: "previous_process", processType: "script", outputKey: "script" },
          },
        ],
      },
    ],
  };
  const methods = { script, thumbnail };
  const legacy = validateBuilderMethods({ channel, methods, plugins: [], collections: [] });
  assert.equal(legacy.ok, false);
  assert.match(legacy.errors.join("\n"), /processo anterior inválido/);
  const reordered = validateBuilderMethods({
    channel: {
      ...channel,
      processOrder: [
        "theme",
        "title",
        "script",
        "thumbnail",
        "narration",
        "assets",
        "editing",
        "publishing",
      ],
    },
    methods,
    plugins: [],
    collections: [],
  });
  assert.equal(reordered.ok, true, reordered.errors.join("\n"));
});

test("builder preserves an explicit canonical binding", () => {
  const method = manualThemeMethod();
  method.blocks.push({
    id: "use-theme",
    type: "CRIAR",
    operator: "Humano",
    inputs: [
      {
        id: "theme-reference",
        label: "Tema",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        binding: { kind: "previous_block", blockId: "theme-input", outputKey: "theme" },
      },
    ],
    outputs: [],
    parameters: [],
    order: 1,
  });

  const result = validateBuilderMethods({
    channel,
    methods: { theme: method },
    plugins: [],
    collections: [],
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.deepEqual(result.methods?.theme?.blocks[1].inputs?.[0].binding, {
    kind: "previous_block",
    blockId: "theme-input",
    outputKey: "theme",
  });
});

test("builder materializes the only compatible plugin input port before runtime", () => {
  const result = validateBuilderMethods({
    channel,
    methods: { theme: pluginThemeMethod() },
    plugins: [pluginContext(["sections"])],
    collections: [],
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.methods?.theme?.blocks[0].inputs?.[0].portKey, "sections");
});

test("builder requires an explicit portKey when multiple plugin ports are compatible", () => {
  const result = validateBuilderMethods({
    channel,
    methods: { theme: pluginThemeMethod() },
    plugins: [pluginContext(["sections", "count"])],
    collections: [],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /informe portKey para a entrada ambígua/);
});

test("builder materializes the only compatible plugin output port before runtime", () => {
  const method = pluginThemeMethod();
  method.blocks[0].outputs = method.blocks[0].outputs?.map((output) => ({
    ...output,
    portKey: undefined,
  }));

  const result = validateBuilderMethods({
    channel,
    methods: { theme: method },
    plugins: [pluginContext(["sections"])],
    collections: [],
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.methods?.theme?.blocks[0].outputs?.[0].portKey, "theme");
});

test("builder requires an explicit portKey when multiple plugin output ports are compatible", () => {
  const method = pluginThemeMethod();
  method.blocks[0].outputs = method.blocks[0].outputs?.map((output) => ({
    ...output,
    portKey: undefined,
  }));

  const result = validateBuilderMethods({
    channel,
    methods: { theme: method },
    plugins: [pluginContext(["sections"], ["theme", "draft"])],
    collections: [],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /informe portKey para a saída ambígua/);
});

test("builder materializes the only compatible validation target port before runtime", () => {
  const result = validateBuilderMethods({
    channel,
    methods: { theme: pluginValidationMethod() },
    plugins: [validationPluginContext(["content"])],
    collections: [],
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.methods?.theme?.blocks[1].validation?.targetPortKey, "content");
});

test("builder requires targetPortKey when multiple plugin ports accept the validation target", () => {
  const result = validateBuilderMethods({
    channel,
    methods: { theme: pluginValidationMethod() },
    plugins: [validationPluginContext(["content", "reference"])],
    collections: [],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /informe targetPortKey/);
});

test("explicit validation target port wins over another compatible port", () => {
  const method = pluginValidationMethod();
  method.blocks[1].validation!.targetPortKey = "reference";
  const result = validateBuilderMethods({
    channel,
    methods: { theme: method },
    plugins: [validationPluginContext(["content", "reference"])],
    collections: [],
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.methods?.theme?.blocks[1].validation?.targetPortKey, "reference");
});

test("builder rejects a newly proposed plugin-bound empty open record", () => {
  const method = pluginThemeMethod();
  method.blocks[0].outputs!.push({
    id: "payload-output",
    label: "Payload",
    key: "payload",
    shape: { kind: "record", cardinality: "one", fields: [], open: true },
    required: true,
    portKey: "payload",
  });
  const plugins = [pluginContext(["sections"])];
  plugins[0].plugin.manifest.capabilities[0].outputPorts.push({
    key: "payload",
    label: "payload",
    shape: { kind: "record", cardinality: "one", fields: [], open: true },
    required: false,
  } as never);

  const result = validateBuilderMethods({
    channel,
    methods: { theme: method },
    plugins,
    collections: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /devem ser conteúdo/);
});

test("builder preserves an identical existing plugin-bound empty open record while editing content", () => {
  const method = pluginThemeMethod();
  method.blocks[0].outputs!.push({
    id: "payload-output",
    label: "Payload",
    key: "payload",
    shape: { kind: "record", cardinality: "one", fields: [], open: true },
    required: true,
    portKey: "payload",
  });
  const plugins = [pluginContext(["sections"])];
  plugins[0].plugin.manifest.capabilities[0].outputPorts.push({
    key: "payload",
    label: "payload",
    shape: { kind: "record", cardinality: "one", fields: [], open: true },
    required: false,
  } as never);
  const existingChannel = {
    ...channel,
    methods: { ...channel.methods, theme: structuredClone(method) },
  };
  method.blocks[0].outputs![0].label = "Tema editado";

  const result = validateBuilderMethods({
    channel: existingChannel,
    methods: { theme: method },
    plugins,
    collections: [],
  });
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.deepEqual(
    result.methods!.theme!.blocks[0].outputs!.find((output) => output.key === "payload")?.shape,
    { kind: "record", cardinality: "one", fields: [], open: true },
  );
});

function internalReceiptShape(): ValueShape {
  return {
    kind: "record",
    cardinality: "one",
    fields: [
      {
        id: "f-receipt",
        label: "Receipt",
        key: "receipt_id",
        required: true,
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
      },
    ],
  } as ValueShape;
}

function internalProducerPlugin(portExtra: Record<string, unknown> = {}): BuilderPluginContext {
  const shape = internalReceiptShape();
  const plugin: RegisteredPlugin = {
    id: "dev.contentflow.receipt-producer",
    source: "local",
    directory: "receipt-producer",
    absoluteDirectory: "C:/plugins/receipt-producer",
    entrypoint: "index.mjs",
    executable: true,
    manifest: {
      apiVersion: "2",
      id: "dev.contentflow.receipt-producer",
      name: "Receipt producer",
      version: "1.0.0",
      description: "Fixture",
      author: "ContentFlow",
      license: "proprietary",
      runtime: { kind: "node", version: ">=26", module: "esm" },
      entrypoint: "index.mjs",
      permissions: [],
      capabilities: [
        {
          id: "produce-receipt",
          operator: "IA",
          blockTypes: ["CRIAR"],
          processTypes: ["theme", "title"],
          inputPorts: [],
          outputPorts: [
            {
              key: "receipt",
              label: "receipt",
              shape: structuredClone(shape) as never,
              required: false,
              internal: true,
              ...portExtra,
            } as never,
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

function internalProducerMethod(): ProcessMethod {
  return {
    contractVersion: 3,
    name: "Recibo interno",
    processType: "theme",
    blocks: [
      {
        id: "produce-receipt",
        type: "CRIAR",
        operator: "IA",
        name: "Produzir recibo",
        instructions: "Produz recibo interno.",
        inputs: [],
        outputs: [
          {
            id: "receipt-output",
            label: "Recibo",
            key: "receipt",
            shape: internalReceiptShape(),
            required: true,
            portKey: "receipt",
          },
        ],
        parameters: [],
        order: 0,
        plugin: {
          pluginId: "dev.contentflow.receipt-producer",
          capabilityId: "produce-receipt",
          configuration: {},
        },
      },
    ],
  };
}

function internalConsumerPlugin(): BuilderPluginContext {
  const shape = internalReceiptShape();
  const plugin: RegisteredPlugin = {
    id: "dev.contentflow.receipt-consumer",
    source: "local",
    directory: "receipt-consumer",
    absoluteDirectory: "C:/plugins/receipt-consumer",
    entrypoint: "index.mjs",
    executable: true,
    manifest: {
      apiVersion: "2",
      id: "dev.contentflow.receipt-consumer",
      name: "Receipt consumer",
      version: "1.0.0",
      description: "Fixture",
      author: "ContentFlow",
      license: "proprietary",
      runtime: { kind: "node", version: ">=26", module: "esm" },
      entrypoint: "index.mjs",
      permissions: [],
      capabilities: [
        {
          id: "consume-receipt",
          operator: "IA",
          blockTypes: ["CRIAR"],
          processTypes: ["theme", "title"],
          inputPorts: [
            {
              key: "receipt_in",
              label: "receipt_in",
              shape: structuredClone(shape) as never,
              required: true,
              internal: true,
            } as never,
          ],
          outputPorts: [
            {
              key: "theme",
              label: "theme",
              shape: {
                kind: "content",
                family: "text",
                cardinality: "one",
                representation: "inline",
              },
              required: false,
            } as never,
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

function internalConsumerBlock(binding: ProcessMethod["blocks"][number]["inputs"] extends (infer T)[] | undefined ? T : never): ProcessMethod["blocks"][number] {
  return {
    id: "consume-receipt",
    type: "CRIAR",
    operator: "IA",
    name: "Consumir recibo",
    instructions: "Consome recibo.",
    inputs: [binding as never],
    outputs: [
      {
        id: "theme-out",
        label: "Tema",
        key: "theme",
        shape: {
          kind: "content",
          family: "text",
          cardinality: "one",
          representation: "inline",
        },
        required: true,
        portKey: "theme",
      },
    ],
    parameters: [],
    order: 1,
    plugin: {
      pluginId: "dev.contentflow.receipt-consumer",
      capabilityId: "consume-receipt",
      configuration: {},
    },
  };
}

test("accepts a marked closed internal receipt output", () => {
  const result = validateBuilderMethods({
    channel,
    methods: { theme: internalProducerMethod() },
    plugins: [internalProducerPlugin()],
    collections: [],
  });
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("rejects an unmarked internal receipt output", () => {
  const method = internalProducerMethod();
  const plugins = [internalProducerPlugin()];
  (plugins[0].plugin.manifest.capabilities[0].outputPorts[0] as unknown as Record<string, unknown>).internal = undefined;
  const result = validateBuilderMethods({ channel, methods: { theme: method }, plugins, collections: [] });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /devem ser conteúdo/);
});

test("rejects a shape-tampered internal receipt output", () => {
  const method = internalProducerMethod();
  const tampered = structuredClone(internalReceiptShape()) as unknown as {
    kind: string;
    cardinality: string;
    fields: Array<{ key: string }>;
  };
  tampered.fields[0].key = "other_id";
  method.blocks[0].outputs![0].shape = tampered as unknown as ValueShape;
  const result = validateBuilderMethods({
    channel,
    methods: { theme: method },
    plugins: [internalProducerPlugin()],
    collections: [],
  });
  assert.equal(result.ok, false);
});

test("rejects a marked empty/open internal receipt output", () => {
  const method = internalProducerMethod();
  method.blocks[0].outputs![0].shape = {
    kind: "record",
    cardinality: "one",
    fields: [],
    open: true,
  } as unknown as ValueShape;
  const plugins = [internalProducerPlugin()];
  plugins[0].plugin.manifest.capabilities[0].outputPorts[0].shape = structuredClone(
    method.blocks[0].outputs![0].shape,
  ) as never;
  const result = validateBuilderMethods({ channel, methods: { theme: method }, plugins, collections: [] });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /devem ser conteúdo/);
});

test("rejects an internal receipt output without an explicit portKey", () => {
  const method = internalProducerMethod();
  delete method.blocks[0].outputs![0].portKey;
  const result = validateBuilderMethods({
    channel,
    methods: { theme: method },
    plugins: [internalProducerPlugin()],
    collections: [],
  });
  assert.equal(result.ok, false);
});

test("rejects an internal receipt from a disabled producer", () => {
  const method = internalProducerMethod();
  const producer = internalProducerPlugin();
  producer.enabled = false;
  const result = validateBuilderMethods({ channel, methods: { theme: method }, plugins: [producer], collections: [] });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /devem ser conteúdo/);
});

test("rejects static and runtime internal inputs", () => {
  for (const binding of [
    { kind: "static", value: "receipt" },
    { kind: "runtime" },
  ] as const) {
    const producer = internalProducerMethod();
    const consumerBinding = {
      id: "receipt-input",
      label: "Recibo",
      shape: internalReceiptShape(),
      binding,
      portKey: "receipt_in",
    };
    producer.blocks.push(internalConsumerBlock(consumerBinding as never));
    const result = validateBuilderMethods({
      channel,
      methods: { theme: producer },
      plugins: [internalProducerPlugin(), internalConsumerPlugin()],
      collections: [],
    });
    assert.equal(result.ok, false, JSON.stringify(binding));
    assert.match(result.errors.join("\n"), /devem ser conteúdo/);
  }
});

test("accepts a previous_block internal receipt consumer", () => {
  const producer = internalProducerMethod();
  producer.blocks.push(
    internalConsumerBlock({
      id: "receipt-input",
      label: "Recibo",
      shape: internalReceiptShape(),
      binding: { kind: "previous_block", blockId: "produce-receipt", outputKey: "receipt" },
      portKey: "receipt_in",
    } as never),
  );
  const result = validateBuilderMethods({
    channel,
    methods: { theme: producer },
    plugins: [internalProducerPlugin(), internalConsumerPlugin()],
    collections: [],
  });
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("rejects fake, missing and future internal sources", () => {
  const cases: Array<{ blockId: string; outputKey: string }> = [
    { blockId: "missing-block", outputKey: "receipt" },
    { blockId: "produce-receipt", outputKey: "missing-key" },
  ];
  for (const source of cases) {
    const producer = internalProducerMethod();
    producer.blocks.push(
      internalConsumerBlock({
        id: "receipt-input",
        label: "Recibo",
        shape: internalReceiptShape(),
        binding: { kind: "previous_block", ...source },
        portKey: "receipt_in",
      } as never),
    );
    const result = validateBuilderMethods({
      channel,
      methods: { theme: producer },
      plugins: [internalProducerPlugin(), internalConsumerPlugin()],
      collections: [],
    });
    assert.equal(result.ok, false, JSON.stringify(source));
  }
  const future = internalProducerMethod();
  future.blocks.unshift({
    id: "early-consumer",
    type: "CRIAR",
    operator: "IA",
    name: "Consumidor precoce",
    instructions: "Consome antes de produzir.",
    inputs: [
      {
        id: "receipt-input",
        label: "Recibo",
        shape: internalReceiptShape(),
        binding: { kind: "previous_block", blockId: "produce-receipt", outputKey: "receipt" },
        portKey: "receipt_in",
      } as never,
    ],
    outputs: [
      {
        id: "theme-out",
        label: "Tema",
        key: "theme",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        required: true,
        portKey: "theme",
      },
    ],
    parameters: [],
    order: 0,
    plugin: {
      pluginId: "dev.contentflow.receipt-consumer",
      capabilityId: "consume-receipt",
      configuration: {},
    },
  });
  future.blocks[1].order = 1;
  const futureResult = validateBuilderMethods({
    channel,
    methods: { theme: future },
    plugins: [internalProducerPlugin(), internalConsumerPlugin()],
    collections: [],
  });
  assert.equal(futureResult.ok, false);
});

test("accepts explicit previous_process:blockId even when proposed keys are out of order", () => {
  const theme = internalProducerMethod();
  const title: ProcessMethod = {
    contractVersion: 3,
    name: "Consumidor title",
    processType: "title",
    blocks: [
      {
        id: "title-consume",
        type: "CRIAR",
        operator: "IA",
        name: "Consumir recibo anterior",
        instructions: "Consome recibo do theme.",
        inputs: [
          {
            id: "receipt-input",
            label: "Recibo",
            shape: internalReceiptShape(),
            binding: {
              kind: "previous_process",
              processType: "theme",
              blockId: "produce-receipt",
              outputKey: "receipt",
            },
            portKey: "receipt_in",
          } as never,
        ],
        outputs: [
          {
            id: "title-out",
            label: "Título",
            key: "title",
            shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
            required: true,
            portKey: "theme",
          },
        ],
        parameters: [],
        order: 0,
        plugin: {
          pluginId: "dev.contentflow.receipt-consumer",
          capabilityId: "consume-receipt",
          configuration: {},
        },
      },
    ],
  };
  const result = validateBuilderMethods({
    channel,
    methods: { title, theme } as unknown as Record<string, ProcessMethod>,
    plugins: [internalProducerPlugin(), internalConsumerPlugin()],
    collections: [],
  });
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("rejects previous_process internal input without blockId and from a later process", () => {
  const theme = internalProducerMethod();
  const title: ProcessMethod = {
    contractVersion: 3,
    name: "Consumidor title",
    processType: "title",
    blocks: [
      {
        id: "title-consume",
        type: "CRIAR",
        operator: "IA",
        name: "Consumir",
        instructions: "Consome.",
        inputs: [
          {
            id: "receipt-input",
            label: "Recibo",
            shape: internalReceiptShape(),
            binding: { kind: "previous_process", processType: "theme", outputKey: "receipt" },
            portKey: "receipt_in",
          } as never,
        ],
        outputs: [],
        parameters: [],
        order: 0,
        plugin: {
          pluginId: "dev.contentflow.receipt-consumer",
          capabilityId: "consume-receipt",
          configuration: {},
        },
      },
    ],
  };
  const missing = validateBuilderMethods({
    channel,
    methods: { theme, title } as unknown as Record<string, ProcessMethod>,
    plugins: [internalProducerPlugin(), internalConsumerPlugin()],
    collections: [],
  });
  assert.equal(missing.ok, false);
  const laterProducer: ProcessMethod = {
    contractVersion: 3,
    name: "Produtor title",
    processType: "title",
    blocks: [
      {
        id: "produce-receipt",
        type: "CRIAR",
        operator: "IA",
        name: "Produzir recibo",
        instructions: "Produz.",
        inputs: [],
        outputs: [
          {
            id: "receipt-output",
            label: "Recibo",
            key: "receipt",
            shape: internalReceiptShape(),
            required: true,
            portKey: "receipt",
          },
        ],
        parameters: [],
        order: 0,
        plugin: {
          pluginId: "dev.contentflow.receipt-producer",
          capabilityId: "produce-receipt",
          configuration: {},
        },
      },
    ],
  };
  const earlierConsumer: ProcessMethod = {
    contractVersion: 3,
    name: "Consumidor theme",
    processType: "theme",
    blocks: [
      {
        id: "theme-consume",
        type: "CRIAR",
        operator: "IA",
        name: "Consumir",
        instructions: "Consome processo posterior.",
        inputs: [
          {
            id: "receipt-input",
            label: "Recibo",
            shape: internalReceiptShape(),
            binding: {
              kind: "previous_process",
              processType: "title",
              blockId: "produce-receipt",
              outputKey: "receipt",
            },
            portKey: "receipt_in",
          } as never,
        ],
        outputs: [],
        parameters: [],
        order: 0,
        plugin: {
          pluginId: "dev.contentflow.receipt-consumer",
          capabilityId: "consume-receipt",
          configuration: {},
        },
      },
    ],
  };
  const later = validateBuilderMethods({
    channel,
    methods: { theme: earlierConsumer, title: laterProducer } as unknown as Record<string, ProcessMethod>,
    plugins: [internalProducerPlugin(), internalConsumerPlugin()],
    collections: [],
  });
  assert.equal(later.ok, false);
});

function approvalConsumerPlugin(): BuilderPluginContext {
  const plugin: RegisteredPlugin = {
    id: "dev.contentflow.approval-consumer",
    source: "local",
    directory: "approval-consumer",
    absoluteDirectory: "C:/plugins/approval-consumer",
    entrypoint: "index.mjs",
    executable: true,
    manifest: {
      apiVersion: "2",
      id: "dev.contentflow.approval-consumer",
      name: "Approval consumer",
      version: "1.0.0",
      description: "Fixture",
      author: "ContentFlow",
      license: "proprietary",
      runtime: { kind: "node", version: ">=26", module: "esm" },
      entrypoint: "index.mjs",
      permissions: [],
      capabilities: [
        {
          id: "consume-approval",
          operator: "IA",
          blockTypes: ["CRIAR"],
          processTypes: ["theme"],
          inputPorts: [
            {
              key: "approval_in",
              label: "approval_in",
              shape: { kind: "control", control: "approval", cardinality: "one" },
              required: true,
              internal: true,
            } as never,
          ],
          outputPorts: [
            {
              key: "theme",
              label: "theme",
              shape: {
                kind: "content",
                family: "text",
                cardinality: "one",
                representation: "inline",
              },
              required: false,
            } as never,
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

function nativeApprovalSourceMethod(): ProcessMethod {
  return {
    contractVersion: 3,
    name: "Aprovação nativa",
    processType: "theme",
    blocks: [
      {
        id: "theme-input",
        type: "CRIAR",
        operator: "Humano",
        name: "Inserir tema",
        instructions: "Tema.",
        inputs: [],
        outputs: [
          {
            id: "theme-output",
            label: "Tema final",
            key: "theme",
            shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
            required: true,
          },
        ],
        parameters: [],
        order: 0,
      },
      {
        id: "human-review",
        type: "VALIDAR",
        operator: "Humano",
        name: "Revisão humana",
        instructions: "Aprove.",
        inputs: [],
        outputs: [
          {
            id: "decision-output",
            label: "Decisão",
            key: "decision",
            shape: { kind: "control", control: "approval", cardinality: "one" },
            required: true,
          },
        ],
        validation: {
          targetBlockId: "theme-input",
          targetOutputKey: "theme",
          mode: "approval",
          onReject: "retry_target",
          maxAttempts: 3,
        },
        parameters: [],
        order: 1,
      },
    ],
  };
}

test("accepts a native human approval consumer", () => {
  const method = nativeApprovalSourceMethod();
  method.blocks.push({
    id: "consume-approval",
    type: "CRIAR",
    operator: "IA",
    name: "Consumir aprovação",
    instructions: "Consome aprovação humana.",
    inputs: [
      {
        id: "approval-input",
        label: "Aprovação",
        shape: { kind: "control", control: "approval", cardinality: "one" },
        binding: { kind: "previous_block", blockId: "human-review", outputKey: "decision" },
        portKey: "approval_in",
      } as never,
    ],
    outputs: [
      {
        id: "theme-out",
        label: "Tema",
        key: "theme",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        required: true,
        portKey: "theme",
      },
    ],
    parameters: [],
    order: 2,
    plugin: {
      pluginId: "dev.contentflow.approval-consumer",
      capabilityId: "consume-approval",
      configuration: {},
    },
  });
  const result = validateBuilderMethods({
    channel,
    methods: { theme: method },
    plugins: [approvalConsumerPlugin()],
    collections: [],
  });
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("rejects static, plugin and AI approval sources", () => {
  const staticMethod = nativeApprovalSourceMethod();
  staticMethod.blocks.push({
    id: "consume-approval",
    type: "CRIAR",
    operator: "IA",
    name: "Consumir",
    instructions: "Consome.",
    inputs: [
      {
        id: "approval-input",
        label: "Aprovação",
        shape: { kind: "control", control: "approval", cardinality: "one" },
        binding: { kind: "static", value: "approved" },
        portKey: "approval_in",
      } as never,
    ],
    outputs: [
      {
        id: "theme-out",
        label: "Tema",
        key: "theme",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        required: true,
        portKey: "theme",
      },
    ],
    parameters: [],
    order: 2,
    plugin: {
      pluginId: "dev.contentflow.approval-consumer",
      capabilityId: "consume-approval",
      configuration: {},
    },
  });
  const staticResult = validateBuilderMethods({
    channel,
    methods: { theme: staticMethod },
    plugins: [approvalConsumerPlugin()],
    collections: [],
  });
  assert.equal(staticResult.ok, false);
  const pluginApprovalMethod = nativeApprovalSourceMethod();
  pluginApprovalMethod.blocks[1] = {
    ...pluginApprovalMethod.blocks[1],
    operator: "IA",
    plugin: {
      pluginId: "dev.contentflow.approval-consumer",
      capabilityId: "consume-approval",
      configuration: {},
    },
  };
  pluginApprovalMethod.blocks.push({
    id: "consume-approval",
    type: "CRIAR",
    operator: "IA",
    name: "Consumir",
    instructions: "Consome aprovação de IA.",
    inputs: [
      {
        id: "approval-input",
        label: "Aprovação",
        shape: { kind: "control", control: "approval", cardinality: "one" },
        binding: { kind: "previous_block", blockId: "human-review", outputKey: "decision" },
        portKey: "approval_in",
      } as never,
    ],
    outputs: [
      {
        id: "theme-out",
        label: "Tema",
        key: "theme",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        required: true,
        portKey: "theme",
      },
    ],
    parameters: [],
    order: 2,
    plugin: {
      pluginId: "dev.contentflow.approval-consumer",
      capabilityId: "consume-approval",
      configuration: {},
    },
  });
  const aiResult = validateBuilderMethods({
    channel,
    methods: { theme: pluginApprovalMethod },
    plugins: [approvalConsumerPlugin()],
    collections: [],
  });
  assert.equal(aiResult.ok, false);
});

test("accepts a native human receipt review bound to the validation target", () => {
  const method = internalProducerMethod();
  method.blocks.push({
    id: "human-review",
    type: "VALIDAR",
    operator: "Humano",
    name: "Revisão humana",
    instructions: "Revise o recibo.",
    inputs: [
      {
        id: "receipt-display",
        label: "Recibo",
        shape: internalReceiptShape(),
        binding: { kind: "previous_block", blockId: "produce-receipt", outputKey: "receipt" },
      } as never,
    ],
    outputs: [
      {
        id: "decision-output",
        label: "Decisão",
        key: "decision",
        shape: { kind: "control", control: "approval", cardinality: "one" },
        required: true,
      },
    ],
    validation: {
      targetBlockId: "produce-receipt",
      targetOutputKey: "receipt",
      mode: "approval",
      onReject: "retry_target",
      maxAttempts: 3,
    },
    parameters: [],
    order: 1,
  });
  const result = validateBuilderMethods({
    channel,
    methods: { theme: method },
    plugins: [internalProducerPlugin()],
    collections: [],
  });
  assert.equal(result.ok, true, result.errors.join("\n"));
});

function baseManifestFixture(overrides: Record<string, unknown> = {}) {
  return {
    apiVersion: "2",
    id: "dev.contentflow.port-test",
    name: "Port test",
    version: "1.0.0",
    description: "Fixture",
    author: "ContentFlow",
    license: "proprietary",
    runtime: { kind: "node", version: ">=26", module: "esm" },
    entrypoint: "index.mjs",
    permissions: [],
    capabilities: [
      {
        id: "create-theme",
        operator: "IA",
        blockTypes: ["CRIAR"],
        inputPorts: [
          {
            key: "sections",
            label: "sections",
            shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
            required: false,
            ...overrides,
          },
        ],
        outputPorts: [
          {
            key: "theme",
            label: "theme",
            shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
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
  };
}

test("plugin manifest accepts internal:true and rejects false or string markers", () => {
  assert.doesNotThrow(() => validatePluginManifest(baseManifestFixture({ internal: true })));
  for (const marker of [false, "yes", 1]) {
    assert.throws(() => validatePluginManifest(baseManifestFixture({ internal: marker })));
  }
});

const NATIVE_DATETIME = { kind: "control", control: "datetime", cardinality: "one" } as const;
const NATIVE_APPROVAL = { kind: "control", control: "approval", cardinality: "one" } as const;

function datetimeConsumerContext(): BuilderPluginContext {
  const plugin: RegisteredPlugin = {
    id: "dev.contentflow.datetime-consumer",
    source: "local",
    directory: "datetime-consumer",
    absoluteDirectory: "C:/plugins/datetime-consumer",
    entrypoint: "index.mjs",
    executable: true,
    manifest: {
      apiVersion: "2",
      id: "dev.contentflow.datetime-consumer",
      name: "Datetime consumer",
      version: "1.0.0",
      description: "Fixture",
      author: "ContentFlow",
      license: "proprietary",
      runtime: { kind: "node", version: ">=26", module: "esm" },
      entrypoint: "index.mjs",
      permissions: [],
      capabilities: [
        {
          id: "consume-datetime",
          operator: "IA",
          blockTypes: ["CRIAR"],
          processTypes: ["theme"],
          inputPorts: [
            {
              key: "date_in",
              label: "date_in",
              shape: structuredClone(NATIVE_DATETIME) as never,
              required: true,
              internal: true,
            } as never,
            {
              key: "approval_in",
              label: "approval_in",
              shape: structuredClone(NATIVE_APPROVAL) as never,
              required: true,
              internal: true,
            } as never,
          ],
          outputPorts: [
            {
              key: "theme",
              label: "theme",
              shape: {
                kind: "content",
                family: "text",
                cardinality: "one",
                representation: "inline",
              },
              required: false,
            } as never,
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

function datetimeGraphMethod(): ProcessMethod {
  return {
    contractVersion: 3,
    name: "Data nativa",
    processType: "theme",
    blocks: [
      {
        id: "pick-date",
        type: "CRIAR",
        operator: "Humano",
        name: "Escolher data",
        instructions: "Escolha a data.",
        inputs: [],
        outputs: [
          {
            id: "date-output",
            label: "Data",
            key: "scheduled_at",
            shape: structuredClone(NATIVE_DATETIME) as never,
            required: true,
          },
        ],
        parameters: [],
        order: 0,
      },
      {
        id: "review-date",
        type: "VALIDAR",
        operator: "Humano",
        name: "Revisar data",
        instructions: "Aprove a data.",
        inputs: [
          {
            id: "date-display",
            label: "Data",
            shape: structuredClone(NATIVE_DATETIME) as never,
            binding: { kind: "previous_block", blockId: "pick-date", outputKey: "scheduled_at" },
          } as never,
        ],
        outputs: [
          {
            id: "decision-output",
            label: "Decisão",
            key: "decision",
            shape: structuredClone(NATIVE_APPROVAL) as never,
            required: true,
          },
        ],
        validation: {
          targetBlockId: "pick-date",
          targetOutputKey: "scheduled_at",
          mode: "approval",
          onReject: "retry_target",
          maxAttempts: 3,
        },
        parameters: [],
        order: 1,
      },
      {
        id: "use-date",
        type: "CRIAR",
        operator: "IA",
        name: "Usar data",
        instructions: "Usa a data aprovada.",
        inputs: [
          {
            id: "date-input",
            label: "Data",
            shape: structuredClone(NATIVE_DATETIME) as never,
            binding: { kind: "previous_block", blockId: "pick-date", outputKey: "scheduled_at" },
            portKey: "date_in",
          } as never,
          {
            id: "approval-input",
            label: "Aprovação",
            shape: structuredClone(NATIVE_APPROVAL) as never,
            binding: { kind: "previous_block", blockId: "review-date", outputKey: "decision" },
            portKey: "approval_in",
          } as never,
        ],
        outputs: [
          {
            id: "theme-out",
            label: "Tema",
            key: "theme",
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            required: true,
            portKey: "theme",
          },
        ],
        parameters: [],
        order: 2,
        plugin: {
          pluginId: "dev.contentflow.datetime-consumer",
          capabilityId: "consume-datetime",
          configuration: {},
        },
      },
    ],
  };
}

test("accepts a qualifying native human datetime graph preserving datetime shape", () => {
  const result = validateBuilderMethods({
    channel,
    methods: { theme: datetimeGraphMethod() },
    plugins: [datetimeConsumerContext()],
    collections: [],
  });
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.deepEqual(result.methods?.theme?.blocks[0].outputs?.[0].shape, {
    kind: "control",
    control: "datetime",
    cardinality: "one",
  });
  assert.deepEqual(result.methods?.theme?.blocks[2].inputs?.[0].shape, {
    kind: "control",
    control: "datetime",
    cardinality: "one",
  });
});

test("rejects human datetime without a full approval and consumer graph", () => {
  const method = datetimeGraphMethod();
  method.blocks = method.blocks.slice(0, 1);
  const result = validateBuilderMethods({
    channel,
    methods: { theme: method },
    plugins: [datetimeConsumerContext()],
    collections: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /devem ser conteúdo/);
  const arbitrary = manualThemeMethod();
  arbitrary.blocks[0].outputs!.push({
    id: "date-extra",
    label: "Data",
    key: "scheduled_at",
    shape: structuredClone(NATIVE_DATETIME) as never,
    required: true,
  });
  const arbitraryResult = validateBuilderMethods({
    channel,
    methods: { theme: arbitrary },
    plugins: [],
    collections: [],
  });
  assert.equal(arbitraryResult.ok, false);
});

test("rejects datetime graphs with AI producer, plugin approval or static source", () => {
  const aiProducer = datetimeGraphMethod();
  aiProducer.blocks[0].operator = "IA";
  assert.equal(
    validateBuilderMethods({
      channel,
      methods: { theme: aiProducer },
      plugins: [datetimeConsumerContext()],
      collections: [],
    }).ok,
    false,
  );
  const pluginApproval = datetimeGraphMethod();
  (pluginApproval.blocks[1] as { plugin?: unknown }).plugin = {
    pluginId: "dev.contentflow.datetime-consumer",
    capabilityId: "consume-datetime",
    configuration: {},
  };
  assert.equal(
    validateBuilderMethods({
      channel,
      methods: { theme: pluginApproval },
      plugins: [datetimeConsumerContext()],
      collections: [],
    }).ok,
    false,
  );
  const staticSource = datetimeGraphMethod();
  (staticSource.blocks[2].inputs![0] as { binding: unknown }).binding = {
    kind: "static",
    value: "2026-10-08T12:00:00Z",
  };
  assert.equal(
    validateBuilderMethods({
      channel,
      methods: { theme: staticSource },
      plugins: [datetimeConsumerContext()],
      collections: [],
    }).ok,
    false,
  );
});

test("rejects mismatched datetime target, future source and unmarked ports", () => {
  const mismatched = datetimeGraphMethod();
  mismatched.blocks[1].validation!.targetOutputKey = "other_key";
  mismatched.blocks[1].inputs![0].shape = structuredClone(NATIVE_DATETIME) as never;
  assert.equal(
    validateBuilderMethods({
      channel,
      methods: { theme: mismatched },
      plugins: [datetimeConsumerContext()],
      collections: [],
    }).ok,
    false,
  );
  const future = datetimeGraphMethod();
  const consumer = future.blocks.pop()!;
  future.blocks.unshift({ ...consumer, id: "early-consumer", order: 0 });
  future.blocks.forEach((block, order) => {
    block.order = order;
  });
  assert.equal(
    validateBuilderMethods({
      channel,
      methods: { theme: future },
      plugins: [datetimeConsumerContext()],
      collections: [],
    }).ok,
    false,
  );
  const unmarked = datetimeGraphMethod();
  delete (unmarked.blocks[2].inputs![0] as { portKey?: string }).portKey;
  assert.equal(
    validateBuilderMethods({
      channel,
      methods: { theme: unmarked },
      plugins: [datetimeConsumerContext()],
      collections: [],
    }).ok,
    false,
  );
  const unmarkedApproval = datetimeGraphMethod();
  delete (unmarkedApproval.blocks[2].inputs![1] as { portKey?: string }).portKey;
  assert.equal(
    validateBuilderMethods({
      channel,
      methods: { theme: unmarkedApproval },
      plugins: [datetimeConsumerContext()],
      collections: [],
    }).ok,
    false,
  );
});

test("rejects datetime consumers that are disabled or capability-mismatched", () => {
  const disabledMethod = datetimeGraphMethod();
  const disabled = datetimeConsumerContext();
  disabled.enabled = false;
  assert.equal(
    validateBuilderMethods({
      channel,
      methods: { theme: disabledMethod },
      plugins: [disabled],
      collections: [],
    }).ok,
    false,
  );
  const mismatched = datetimeGraphMethod();
  mismatched.blocks[2].operator = "Código";
  assert.equal(
    validateBuilderMethods({
      channel,
      methods: { theme: mismatched },
      plugins: [datetimeConsumerContext()],
      collections: [],
    }).ok,
    false,
  );
});
