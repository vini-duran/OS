import assert from "node:assert/strict";
import test from "node:test";
import type { ProcessMethod } from "../src/lib/domain";
import {
  isNativeHumanDatetimeShape,
  proveNativeHumanDatetimeGraphs,
  type DatetimePluginContext,
} from "./native-human-datetime-contract";

const DATETIME = { kind: "control", control: "datetime", cardinality: "one" } as const;
const APPROVAL = { kind: "control", control: "approval", cardinality: "one" } as const;

function consumerPlugins(): DatetimePluginContext[] {
  return [
    {
      plugin: {
        id: "dev.contentflow.datetime-consumer",
        executable: true,
        manifest: {
          capabilities: [
            {
              id: "consume-datetime",
              operator: "IA",
              blockTypes: ["CRIAR"],
              processTypes: ["theme"],
              inputPorts: [
                { key: "date_in", shape: structuredClone(DATETIME), internal: true },
                { key: "approval_in", shape: structuredClone(APPROVAL), internal: true },
              ],
            },
          ],
        },
      },
      enabled: true,
    },
  ];
}

function qualifyingMethod(): ProcessMethod {
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
        inputs: [],
        outputs: [
          {
            id: "date-output",
            label: "Data",
            key: "scheduled_at",
            shape: structuredClone(DATETIME) as never,
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
        inputs: [
          {
            id: "date-display",
            label: "Data",
            shape: structuredClone(DATETIME) as never,
            binding: { kind: "previous_block", blockId: "pick-date", outputKey: "scheduled_at" },
          } as never,
        ],
        outputs: [
          {
            id: "decision-output",
            label: "Decisão",
            key: "decision",
            shape: structuredClone(APPROVAL) as never,
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
        inputs: [
          {
            id: "date-input",
            label: "Data",
            shape: structuredClone(DATETIME) as never,
            binding: { kind: "previous_block", blockId: "pick-date", outputKey: "scheduled_at" },
            portKey: "date_in",
          } as never,
          {
            id: "approval-input",
            label: "Aprovação",
            shape: structuredClone(APPROVAL) as never,
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

function portKeys(method: ProcessMethod, processType: string) {
  const map = new Map<string, string | undefined>();
  for (const block of method.blocks) {
    for (const input of block.inputs ?? []) {
      map.set(`${processType}/${block.id}/${input.id}`, (input as { portKey?: string }).portKey);
    }
  }
  return map;
}

test("prova o grafo completo preservando datetime exato com ordem de chaves irrelevante", () => {
  const method = qualifyingMethod();
  // Ordem de chaves diferente continua válida.
  method.blocks[0].outputs![0].shape = {
    cardinality: "one",
    control: "datetime",
    kind: "control",
  } as never;
  assert.equal(isNativeHumanDatetimeShape(method.blocks[0].outputs![0].shape), true);
  const proofs = proveNativeHumanDatetimeGraphs({
    method,
    processType: "theme",
    plugins: consumerPlugins(),
    originalInputPortKeys: portKeys(method, "theme"),
  });
  assert.equal(proofs.length, 1);
  assert.deepEqual(
    { producer: proofs[0].producerBlockId, output: proofs[0].producerOutputKey },
    { producer: "pick-date", output: "scheduled_at" },
  );
});

test("rejeita produtor IA, aprovação com plugin e fonte estática ausente", () => {
  const plugins = consumerPlugins();
  const aiProducer = qualifyingMethod();
  aiProducer.blocks[0].operator = "IA";
  assert.equal(
    proveNativeHumanDatetimeGraphs({
      method: aiProducer,
      processType: "theme",
      plugins,
      originalInputPortKeys: portKeys(aiProducer, "theme"),
    }).length,
    0,
  );
  const pluginApproval = qualifyingMethod();
  (pluginApproval.blocks[1] as { plugin?: unknown }).plugin = {
    pluginId: "x",
    capabilityId: "y",
    configuration: {},
  };
  assert.equal(
    proveNativeHumanDatetimeGraphs({
      method: pluginApproval,
      processType: "theme",
      plugins,
      originalInputPortKeys: portKeys(pluginApproval, "theme"),
    }).length,
    0,
  );
  const staticSource = qualifyingMethod();
  (staticSource.blocks[2].inputs![0] as { binding: unknown }).binding = {
    kind: "static",
    value: "2026-10-08T12:00:00Z",
  };
  assert.equal(
    proveNativeHumanDatetimeGraphs({
      method: staticSource,
      processType: "theme",
      plugins,
      originalInputPortKeys: portKeys(staticSource, "theme"),
    }).length,
    0,
  );
});

test("rejeita alvo trocado, fonte futura, porta sem marca e capability incompatível", () => {
  const plugins = consumerPlugins();
  const mismatched = qualifyingMethod();
  mismatched.blocks[1].validation!.targetOutputKey = "other_key";
  assert.equal(
    proveNativeHumanDatetimeGraphs({
      method: mismatched,
      processType: "theme",
      plugins,
      originalInputPortKeys: portKeys(mismatched, "theme"),
    }).length,
    0,
  );
  const future = qualifyingMethod();
  future.blocks.reverse();
  future.blocks.forEach((block, order) => {
    block.order = order;
  });
  assert.equal(
    proveNativeHumanDatetimeGraphs({
      method: future,
      processType: "theme",
      plugins,
      originalInputPortKeys: portKeys(future, "theme"),
    }).length,
    0,
  );
  const unmarked = qualifyingMethod();
  const unmarkedPlugins: DatetimePluginContext[] = [
    {
      plugin: {
        id: "dev.contentflow.datetime-consumer",
        executable: true,
        manifest: {
          capabilities: [
            {
              id: "consume-datetime",
              operator: "IA",
              blockTypes: ["CRIAR"],
              processTypes: ["theme"],
              inputPorts: [
                { key: "date_in", shape: structuredClone(DATETIME) },
                { key: "approval_in", shape: structuredClone(APPROVAL), internal: true },
              ],
            },
          ],
        },
      },
      enabled: true,
    },
  ];
  assert.equal(
    proveNativeHumanDatetimeGraphs({
      method: unmarked,
      processType: "theme",
      plugins: unmarkedPlugins,
      originalInputPortKeys: portKeys(unmarked, "theme"),
    }).length,
    0,
  );
  const disabled = qualifyingMethod();
  const disabledPlugins = consumerPlugins();
  disabledPlugins[0].enabled = false;
  assert.equal(
    proveNativeHumanDatetimeGraphs({
      method: disabled,
      processType: "theme",
      plugins: disabledPlugins,
      originalInputPortKeys: portKeys(disabled, "theme"),
    }).length,
    0,
  );
  const mismatchedCapability = qualifyingMethod();
  mismatchedCapability.blocks[2].operator = "Código";
  assert.equal(
    proveNativeHumanDatetimeGraphs({
      method: mismatchedCapability,
      processType: "theme",
      plugins,
      originalInputPortKeys: portKeys(mismatchedCapability, "theme"),
    }).length,
    0,
  );
});

test("exige binding explícito com portKey original", () => {
  const method = qualifyingMethod();
  const keys = portKeys(method, "theme");
  keys.set("theme/use-date/date-input", undefined);
  assert.equal(
    proveNativeHumanDatetimeGraphs({
      method,
      processType: "theme",
      plugins: consumerPlugins(),
      originalInputPortKeys: keys,
    }).length,
    0,
  );
});
