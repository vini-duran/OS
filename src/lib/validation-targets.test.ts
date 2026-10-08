import assert from "node:assert/strict";
import test from "node:test";
import type { ActionBlock, ProcessMethod } from "./domain";
import {
  createValidationFields,
  getMethodConfigurationIssue,
  normalizeMethodBlocks,
} from "./human-workflow";

function createBlock(id: string, order: number, outputs = ["value"]): ActionBlock {
  return {
    id,
    type: "CRIAR",
    operator: "Humano",
    name: id,
    inputs: [],
    outputs: outputs.map((key, index) => ({
      id: `${id}-${key}`,
      label: key,
      key,
      shape: {
        kind: "content",
        family: "text",
        cardinality: index === 0 ? "many" : "one",
        representation: "inline",
      },
      required: true,
    })),
    parameters: [],
    order,
  };
}

function validateBlock(
  id: string,
  order: number,
  targetBlockId: string,
  mode: "approval" | "select_one" | "select_many" = "approval",
  targetOutputKey?: string,
): ActionBlock {
  return {
    id,
    type: "VALIDAR",
    operator: "Humano",
    name: id,
    inputs: [],
    outputs: createValidationFields(mode, targetBlockId, targetOutputKey, {
      kind: "content",
      family: "text",
      cardinality: "many",
      representation: "inline",
    }),
    validation: {
      targetBlockId,
      targetOutputKey,
      mode,
      onReject: "retry_target",
      maxAttempts: 3,
      retryMode: "full",
    },
    parameters: [],
    order,
  };
}

function method(blocks: ActionBlock[]): ProcessMethod {
  return { contractVersion: 3, name: "Explicit validation", processType: "theme", blocks };
}

test("explicit target remains authoritative when another block is immediately before VALIDAR", () => {
  const blocks = [createBlock("a", 0), createBlock("b", 1), validateBlock("review", 2, "a")];
  const normalized = normalizeMethodBlocks(blocks, "theme");

  assert.equal(normalized[2].validation?.targetBlockId, "a");
  assert.equal(getMethodConfigurationIssue(method(normalized)), undefined);
});

test("missing target remains missing and fails configuration instead of selecting the prior block", () => {
  const normalized = normalizeMethodBlocks(
    [createBlock("a", 0), validateBlock("review", 1, "")],
    "theme",
  );

  assert.equal(normalized[1].validation?.targetBlockId, "");
  assert.match(
    getMethodConfigurationIssue(method(normalized)) ?? "",
    /Selecione um bloco anterior/,
  );
});

test("future and VALIDAR targets fail structural configuration", () => {
  const future = method([validateBlock("review", 0, "future"), createBlock("future", 1)]);
  assert.match(getMethodConfigurationIssue(future) ?? "", /Selecione um bloco anterior/);

  const firstReview = validateBlock("first-review", 1, "source");
  const secondReview = validateBlock("second-review", 2, "first-review");
  assert.match(
    getMethodConfigurationIssue(method([createBlock("source", 0), firstReview, secondReview])) ??
      "",
    /Buscar, Escolher ou Criar/,
  );
});

for (const mode of ["select_one", "select_many"] as const) {
  test(`${mode} preserves the explicitly selected output and mirrors it in its own output`, () => {
    const target = createBlock("generator", 0, ["other", "candidates"]);
    const review = validateBlock("review", 1, target.id, mode, "candidates");
    const normalized = normalizeMethodBlocks([target, review], "theme");
    const selected = normalized[1].outputs?.find((output) =>
      ["selected_value", "selected_values"].includes(output.key),
    );

    assert.equal(normalized[1].validation?.targetOutputKey, "candidates");
    assert.equal(selected?.optionsSourceBlockId, "generator");
    assert.equal(selected?.optionsSourceKey, "candidates");
    assert.equal(getMethodConfigurationIssue(method(normalized)), undefined);
  });
}

test("selection without an existing explicit output fails and never falls back by type or order", () => {
  const target = createBlock("generator", 0, ["first-list", "second"]);
  const review = validateBlock("review", 1, target.id, "select_one", "missing");
  const normalized = normalizeMethodBlocks([target, review], "theme");

  assert.equal(normalized[1].validation?.targetOutputKey, "missing");
  assert.match(getMethodConfigurationIssue(method(normalized)) ?? "", /Selecione qual saída/);
});

test("reordering outputs or inserting a block does not reinterpret explicit validation references", () => {
  const target = createBlock("target", 0, ["first", "chosen"]);
  const review = validateBlock("review", 1, target.id, "select_one", "chosen");
  const reorderedTarget = { ...target, outputs: [...(target.outputs ?? [])].reverse() };
  const inserted = createBlock("inserted", 1);
  const reorderedReview = { ...review, order: 2 };

  const outputReordered = normalizeMethodBlocks([reorderedTarget, review], "theme");
  const blockInserted = normalizeMethodBlocks([target, inserted, reorderedReview], "theme");

  assert.equal(outputReordered[1].validation?.targetOutputKey, "chosen");
  assert.equal(blockInserted[2].validation?.targetBlockId, "target");
});

test("approval validates the block as a unit and does not require targetOutputKey", () => {
  const blocks = [
    createBlock("target", 0, ["draft", "notes"]),
    validateBlock("review", 1, "target"),
  ];
  const normalized = normalizeMethodBlocks(blocks, "theme");

  assert.equal(normalized[1].validation?.targetOutputKey, undefined);
  assert.equal(getMethodConfigurationIssue(method(normalized)), undefined);
});

function pluginBlock(
  id: string,
  order: number,
  outputs: ActionBlock["outputs"] = [],
  inputs: ActionBlock["inputs"] = [],
): ActionBlock {
  return {
    id,
    type: "CRIAR",
    operator: "IA",
    name: id,
    inputs,
    outputs,
    plugin: {
      pluginId: "dev.contentflow.test-plugin",
      capabilityId: "generate",
      configuration: {},
    },
    parameters: [],
    order,
  };
}

test("permits empty open records only when they are bound to plugin ports", () => {
  const producer = pluginBlock("plugin-producer", 0, [
    {
      id: "out-records",
      label: "Registros gerados",
      key: "items",
      shape: { kind: "record", cardinality: "many", fields: [], open: true },
      required: true,
      portKey: "records_out",
    },
  ]);
  const consumer = pluginBlock(
    "plugin-consumer",
    1,
    [],
    [
      {
        id: "in-records",
        label: "Registros de entrada",
        shape: { kind: "record", cardinality: "many", fields: [], open: true },
        binding: { kind: "previous_block", blockId: producer.id, outputKey: "items" },
        portKey: "records_in",
      },
    ],
  );

  assert.equal(getMethodConfigurationIssue(method([producer, consumer])), undefined);

  producer.plugin = undefined;
  assert.match(getMethodConfigurationIssue(method([producer])) ?? "", /Defina a chave/);
});

test("continues rejecting closed records and invalid keys on plugin ports", () => {
  const closed = pluginBlock("plugin-closed", 0, [
    {
      id: "closed-records",
      label: "Lista fechada",
      key: "items",
      shape: { kind: "record", cardinality: "many", fields: [] },
      required: true,
      portKey: "records_out",
    },
  ]);
  assert.match(getMethodConfigurationIssue(method([closed])) ?? "", /Defina a chave/);

  closed.outputs![0].shape = {
    kind: "record",
    cardinality: "many",
    open: true,
    fields: [
      {
        id: "missing-key",
        label: "Sem chave",
        key: "",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        required: true,
      },
    ],
  };
  assert.match(getMethodConfigurationIssue(method([closed])) ?? "", /Defina a chave/);
});
