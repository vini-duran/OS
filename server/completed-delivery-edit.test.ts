import assert from "node:assert/strict";
import test from "node:test";
import type { ActionBlock } from "../src/lib/domain";
import { validateCompletedDeliveryEdit } from "./completed-delivery-edit";

const text = { kind: "content", family: "text", cardinality: "one", representation: "inline" } as const;
function block(): ActionBlock {
  return {
    id: "upload", name: "Upload", order: 0, type: "CRIAR", operator: "Código", instructions: "", parameters: [],
    plugin: { pluginId: "test.publisher", capabilityId: "upload", configuration: {} },
    outputs: [
      { id: "url", key: "url", label: "URL", required: true,
        shape: { kind: "control", control: "url", cardinality: "one" }, portKey: "url" },
      { id: "caption", key: "caption", label: "Legenda", required: true, shape: text, portKey: "caption" },
    ],
  };
}

test("cannot forge a publisher URL through completed-delivery editing", () => {
  const current = { url: "https://example.com/real", caption: "Original" };
  const result = validateCompletedDeliveryEdit(block(), current,
    { ...current, url: "https://example.com/fabricated" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 409);
  assert.equal(current.url, "https://example.com/real");
});

test("content can be corrected without changing the actual machine receipt", () => {
  const current = { url: "https://example.com/real", caption: "Original" };
  const result = validateCompletedDeliveryEdit(block(), current, { ...current, caption: "Corrigida" });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.values, { ...current, caption: "Corrigida" });
});

test("a completed native approval cannot be changed through the edit endpoint", () => {
  const b = block();
  delete b.plugin;
  b.type = "VALIDAR";
  b.operator = "Humano";
  b.validation = { targetBlockId: "upload", targetOutputKey: "caption", mode: "approval", onReject: "pause", maxAttempts: 1 };
  b.outputs = [{ id: "decision", key: "decision", label: "Decisão", required: true,
    shape: { kind: "control", control: "approval", cardinality: "one" } }];
  const result = validateCompletedDeliveryEdit(b, { decision: "rejected" }, { decision: "approved" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 409);
});

test("closed publisher records cannot be fabricated or omitted", () => {
  const b = block();
  b.outputs = [{ id: "receipt", key: "receipt", label: "Recibo", required: true,
    shape: { kind: "record", cardinality: "one", fields: [{ id: "status", key: "status", label: "Estado", required: true, shape: text }] }, portKey: "receipt" }];
  for (const submitted of [{ receipt: { status: "published" } }, {}]) {
    const result = validateCompletedDeliveryEdit(b, { receipt: { status: "uploaded" } }, submitted);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 409);
  }
});

test("content editing still validates actual cardinality and required values", () => {
  const current = { url: "https://example.com/real", caption: "Original" };
  for (const caption of [["invalid collection"], ""]) {
    const result = validateCompletedDeliveryEdit(block(), current, { ...current, caption });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
  }
});

test("human date entry remains editable and undeclared fields remain forbidden", () => {
  const b = block();
  delete b.plugin;
  b.operator = "Humano";
  b.outputs = [{ id: "date", key: "date", label: "Data", required: true,
    shape: { kind: "control", control: "datetime", cardinality: "one" } }];
  assert.equal(validateCompletedDeliveryEdit(b, { date: "2026-10-08T12:00:00Z" },
    { date: "2026-10-09T12:00:00Z" }, { methodSnapshot: { blocks: [b] }, blocks: [{ blockId: b.id, status: "completed" }] }).ok, true);
  assert.equal(validateCompletedDeliveryEdit(b, {}, { date: "2026-10-09T12:00:00Z", forged: true }).ok, false);
});

const DATETIME_SHAPE = { kind: "control", control: "datetime", cardinality: "one" } as const;

test("date changes fail closed without authoritative execution context", () => {
  const result = validateCompletedDeliveryEdit(dateProducer(),
    { scheduled_at: "2026-10-08T12:00:00Z" }, { scheduled_at: "2026-10-09T12:00:00Z" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
});

test("date changes fail closed when downstream state is missing", () => {
  const context = dateExecutionContext({});
  context.blocks = context.blocks.filter((b) => b.blockId !== "review-date");
  const result = validateCompletedDeliveryEdit(dateProducer(),
    { scheduled_at: "2026-10-08T12:00:00Z" }, { scheduled_at: "2026-10-09T12:00:00Z" }, context);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 409);
});

function dateProducer(): ActionBlock {
  return {
    id: "pick-date",
    name: "Escolher data",
    order: 0,
    type: "CRIAR",
    operator: "Humano",
    instructions: "",
    parameters: [],
    outputs: [
      {
        id: "date",
        key: "scheduled_at",
        label: "Data",
        required: true,
        shape: structuredClone(DATETIME_SHAPE) as never,
      },
    ],
  };
}

function dateExecutionContext(overrides: Record<string, "pending" | "blocked_executor" | "awaiting_human" | "in_progress" | "completed">) {
  return {
    methodSnapshot: {
      blocks: [
        dateProducer(),
        {
          id: "review-date",
          name: "Revisar data",
          order: 1,
          type: "VALIDAR",
          operator: "Humano",
          instructions: "",
          parameters: [],
          inputs: [
            {
              id: "date-display",
              label: "Data",
              shape: structuredClone(DATETIME_SHAPE) as never,
              binding: { kind: "previous_block", blockId: "pick-date", outputKey: "scheduled_at" },
            } as never,
          ],
          outputs: [
            {
              id: "decision",
              key: "decision",
              label: "Decisão",
              required: true,
              shape: { kind: "control", control: "approval", cardinality: "one" },
            },
          ],
          validation: {
            targetBlockId: "pick-date",
            targetOutputKey: "scheduled_at",
            mode: "approval",
            onReject: "retry_target",
            maxAttempts: 3,
          },
        } as ActionBlock,
        {
          id: "use-date",
          name: "Usar data",
          order: 2,
          type: "CRIAR",
          operator: "IA",
          instructions: "",
          parameters: [],
          inputs: [
            {
              id: "date-input",
              label: "Data",
              shape: structuredClone(DATETIME_SHAPE) as never,
              binding: { kind: "previous_block", blockId: "pick-date", outputKey: "scheduled_at" },
              portKey: "date_in",
            } as never,
          ],
          outputs: [],
          plugin: { pluginId: "p", capabilityId: "c", configuration: {} },
        } as ActionBlock,
      ],
    },
    blocks: [
      { blockId: "pick-date", status: "completed" },
      { blockId: "review-date", status: overrides["review-date"] ?? "pending" },
      { blockId: "use-date", status: overrides["use-date"] ?? "pending" },
    ] as Array<{ blockId: string; status: "pending" | "blocked_executor" | "awaiting_human" | "in_progress" | "completed" }>,
  };
}

test("pending downstream approval and consumer allow a date correction", () => {
  const b = dateProducer();
  const result = validateCompletedDeliveryEdit(
    b,
    { scheduled_at: "2026-10-08T12:00:00Z" },
    { scheduled_at: "2026-10-09T12:00:00Z" },
    dateExecutionContext({}),
  );
  assert.equal(result.ok, true);
});

test("completed, active or rejected downstream approval blocks a date change", () => {
  const b = dateProducer();
  for (const status of ["awaiting_human", "in_progress", "completed"] as const) {
    const result = validateCompletedDeliveryEdit(
      b,
      { scheduled_at: "2026-10-08T12:00:00Z" },
      { scheduled_at: "2026-10-09T12:00:00Z" },
      dateExecutionContext({ "review-date": status }),
    );
    assert.equal(result.ok, false, status);
    if (!result.ok) {
      assert.equal(result.status, 409);
      assert.match(result.error, /nova aprovação|reconciliação/);
    }
  }
  assert.equal(
    validateCompletedDeliveryEdit(
      b,
      { scheduled_at: "2026-10-08T12:00:00Z" },
      { scheduled_at: "2026-10-09T12:00:00Z" },
      dateExecutionContext({ "review-date": "blocked_executor" }),
    ).ok,
    true,
  );
});

test("active or completed downstream consumer blocks a date change", () => {
  const b = dateProducer();
  for (const status of ["awaiting_human", "in_progress", "completed"] as const) {
    const result = validateCompletedDeliveryEdit(
      b,
      { scheduled_at: "2026-10-08T12:00:00Z" },
      { scheduled_at: "2026-10-09T12:00:00Z" },
      dateExecutionContext({ "use-date": status }),
    );
    assert.equal(result.ok, false, status);
    if (!result.ok) assert.equal(result.status, 409);
  }
});

test("unchanged protected date still permits a content correction", () => {
  const b: ActionBlock = {
    ...dateProducer(),
    outputs: [
      ...dateProducer().outputs!,
      {
        id: "note",
        key: "note",
        label: "Nota",
        required: true,
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
      },
    ],
  };
  const result = validateCompletedDeliveryEdit(
    b,
    { scheduled_at: "2026-10-08T12:00:00Z", note: "Antes" },
    { scheduled_at: "2026-10-08T12:00:00Z", note: "Depois" },
    dateExecutionContext({ "review-date": "completed", "use-date": "completed" }),
  );
  assert.equal(result.ok, true);
});
