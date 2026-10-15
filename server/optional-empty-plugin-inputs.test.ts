import assert from "node:assert/strict";
import test from "node:test";
import { resolveBlockInputs } from "../src/lib/runtime-contract";
import type { ActionBlock, ProcessExecution, Project, ValueShape } from "../src/lib/domain";

const many: ValueShape = {
  kind: "content",
  family: "text",
  cardinality: "many",
  representation: "inline",
};
function scenario(value: unknown = [], required = false, status = "completed") {
  const source: ActionBlock = {
    id: "source",
    type: "CRIAR",
    operator: "Código",
    parameters: [],
    order: 0,
    outputs: [{ id: "source-output", key: "results", label: "Results", shape: many, required }],
  };
  const target: ActionBlock = {
    id: "target",
    type: "CRIAR",
    operator: "Código",
    parameters: [],
    order: 1,
    inputs: [
      {
        id: "optional",
        label: "Optional",
        shape: many,
        portKey: "results",
        binding: { kind: "previous_block", blockId: source.id, outputKey: "results" },
      },
    ],
  };
  const execution = {
    id: "execution",
    projectId: "project",
    processType: "theme",
    methodSnapshot: {
      contractVersion: 3,
      name: "Test",
      processType: "theme",
      blocks: [source, target],
    },
    blocks: [
      {
        blockId: source.id,
        status,
        values: value === undefined ? {} : { results: value },
        attempt: 1,
      },
      { blockId: target.id, status: "pending", values: {}, attempt: 1 },
    ],
  } as ProcessExecution;
  const project = { id: "project" } as Project;
  const resolve = (allow: string[] = []) =>
    resolveBlockInputs({
      block: target,
      execution,
      project,
      projectExecutions: [],
      collections: [],
      libraryItems: [],
      optionalEmptyInputIds: allow,
    })[0];
  return { target, resolve };
}
test("optional collection consumes an explicitly produced empty value, without fabricated items", () => {
  const { resolve } = scenario();
  const out = resolve(["optional"]);
  assert.equal(out.resolved, true);
  assert.deepEqual(out.value, []);
  assert.equal(out.sourceBlockId, "source");
  assert.equal(out.sourceDeliveryItems?.length ?? 0, 0);
});
test("existing required/human resolution still blocks an empty collection", () =>
  assert.equal(scenario().resolve().resolved, false));
test("empty output declared required is not adopted as completed optional input", () =>
  assert.equal(scenario([], true).resolve(["optional"]).resolved, false));
test("missing and pending sources remain unresolved", () => {
  assert.equal(scenario(null).resolve(["optional"]).resolved, false);
  assert.equal(scenario([], false, "pending").resolve(["optional"]).resolved, false);
});
test("unknown bindings and scalar targets are never inferred from empty collections", () => {
  const a = scenario();
  a.target.inputs![0].binding = {
    kind: "previous_block",
    blockId: "missing",
    outputKey: "results",
  };
  assert.equal(a.resolve(["optional"]).resolved, false);
  const b = scenario();
  b.target.inputs![0].shape = { ...many, cardinality: "one" };
  assert.equal(b.resolve(["optional"]).resolved, false);
});
test("nonempty bindings retain their original values", () =>
  assert.deepEqual(scenario(["literal"]).resolve().value, ["literal"]));
