import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createPersistentPluginJob, PluginJobStore } from "./plugin-job-store";
import { prepareItemJobResume } from "./plugin-item-resume";
import { invocationRequestForJob } from "./plugin-item-orchestration";
import type { PluginExecutionRequest } from "../src/lib/plugin-contract";

function fixture() {
  const request = {
    executionId: "execution",
    blockId: "block",
    capabilityId: "text",
    traceId: "trace",
    attempt: 1,
    configuration: { accountProfile: "prepared" },
    inputs: { outline: [1, 2, 3, 4, 5, 6, 7, 8] },
    outputContract: [{ key: "parts", portKey: "parts" }],
    conversation: { mode: "reuse", id: "opaque-conversation", sourceProfile: "prepared" },
  } as unknown as PluginExecutionRequest;
  const job = createPersistentPluginJob({
    pluginId: "example",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 60_000,
    itemOrchestration: {
      inputPort: "outline",
      outputPort: "parts",
      items: [1, 2, 3, 4, 5, 6, 7, 8],
      itemIds: ["a", "b", "c", "d", "e", "f", "g", "h"],
      currentIndex: 3,
    },
  });
  job.status = "failed";
  job.error = "send unavailable";
  job.partialValues = { parts: ["one", "two", "three"], result: "one\n\ntwo\n\nthree" };
  return job;
}
const options = {
  pluginVersion: "1.0.1",
  timeoutMs: 60_000,
  reconciliationNote: "Provider state reconciled by automation.",
};

test("resume preserves three parts, cursor, conversation and original error history", () => {
  const job = fixture();
  const original = structuredClone(job);
  const next = prepareItemJobResume(job, options);
  assert.deepEqual(job, original);
  assert.deepEqual(next.partialValues, original.partialValues);
  assert.deepEqual(next.itemOrchestration, original.itemOrchestration);
  assert.deepEqual(next.request, original.request);
  assert.equal(next.recoveryHistory?.[0].previousError, original.error);
  assert.equal(next.pluginVersion, "1.0.1");
  const invocation = invocationRequestForJob(next, { mode: "start" });
  assert.equal(invocation.inputs.outline, 4);
  assert.deepEqual(invocation.batch?.completedItems, ["one", "two", "three"]);
  assert.equal(invocation.attempt, 2);
});
test("reject unsafe or inconsistent checkpoints without modifying them", () => {
  for (const mutate of [
    (j) => (j.status = "completed"),
    (j) => (j.status = "starting"),
    (j) => (j.status = "cancelled"),
    (j) => (j.cancelRequested = true),
    (j) => (j.jobId = "remote-job"),
    (j) => (j.itemOrchestration!.currentIndex = 0),
    (j) => (j.itemOrchestration!.currentIndex = 8),
    (j) => (j.partialValues.parts = ["one"]),
    (j) => (j.itemOrchestration!.itemIds = []),
  ] as Array<(j: ReturnType<typeof fixture>) => void>) {
    const j = fixture();
    mutate(j);
    const before = structuredClone(j);
    assert.throws(() => prepareItemJobResume(j, options));
    assert.deepEqual(j, before);
  }
  assert.throws(() => prepareItemJobResume(fixture(), { ...options, reconciliationNote: "" }));
});
test("atomic resume: duplicate/stale requests do not schedule twice; callback failure rolls back", () => {
  const db = new Database(":memory:");
  try {
    const store = new PluginJobStore(db);
    const job = store.create(fixture());
    assert.throws(() => store.resumeFailedItems(job.id, "stale", options));
    assert.throws(() =>
      store.resumeFailedItems(job.id, job.updatedAt, options, () => {
        throw Error("persist failed");
      }),
    );
    assert.deepEqual(store.get(job.id), job);
    const next = store.resumeFailedItems(job.id, job.updatedAt, options);
    assert.equal(next.status, "starting");
    assert.throws(() => store.resumeFailedItems(job.id, job.updatedAt, options));
    assert.ok(store.claim(job.id));
    assert.equal(store.claim(job.id), undefined);
    assert.deepEqual(store.get(job.id)?.partialValues, job.partialValues);
  } finally {
    db.close();
  }
});
