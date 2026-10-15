import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyMethods,
  PROCESS_ORDER,
  type ActionBlock,
  type Channel,
  type ProcessExecution,
  type Project,
} from "../src/lib/domain";
import { resolveBlockInputs } from "../src/lib/runtime-contract";
import {
  NATIVE_APPROVAL_ONE_SHAPE,
  NATIVE_HUMAN_DATETIME_SHAPE,
} from "./native-human-datetime-contract";
import { executionCommands } from "./execution-commands";

const DATETIME = structuredClone(NATIVE_HUMAN_DATETIME_SHAPE);
const APPROVAL = structuredClone(NATIVE_APPROVAL_ONE_SHAPE);
const TEXT = {
  kind: "content",
  family: "text",
  cardinality: "one",
  representation: "inline",
} as const;

function fixture() {
  const producer: ActionBlock = {
    id: "pick-date",
    type: "CRIAR",
    operator: "Humano",
    name: "Escolher data",
    inputs: [],
    outputs: [
      {
        id: "date-output",
        key: "scheduled_at",
        label: "Data",
        shape: structuredClone(DATETIME),
        required: true,
      },
    ],
    parameters: [],
    order: 0,
  };
  const review: ActionBlock = {
    id: "review-date",
    type: "VALIDAR",
    operator: "Humano",
    name: "Revisar data",
    inputs: [
      {
        id: "date-display",
        label: "Data recebida",
        shape: structuredClone(DATETIME),
        binding: { kind: "previous_block", blockId: producer.id, outputKey: "scheduled_at" },
      },
    ],
    outputs: [
      {
        id: "decision-output",
        key: "decision",
        label: "Decisão",
        shape: structuredClone(APPROVAL),
        required: true,
      },
    ],
    validation: {
      targetBlockId: producer.id,
      targetOutputKey: "scheduled_at",
      mode: "approval",
      onReject: "retry_target",
      maxAttempts: 3,
    },
    parameters: [],
    order: 1,
  };
  const consumer: ActionBlock = {
    id: "use-date",
    type: "CRIAR",
    operator: "IA",
    name: "Consumir data aprovada",
    inputs: [
      {
        id: "date-input",
        label: "Data",
        shape: structuredClone(DATETIME),
        binding: { kind: "previous_block", blockId: producer.id, outputKey: "scheduled_at" },
        portKey: "date_in",
      },
      {
        id: "approval-input",
        label: "Aprovação",
        shape: structuredClone(APPROVAL),
        binding: { kind: "previous_block", blockId: review.id, outputKey: "decision" },
        portKey: "approval_in",
      },
    ],
    outputs: [
      {
        id: "result-output",
        key: "result",
        label: "Resultado",
        shape: structuredClone(TEXT),
        required: true,
        portKey: "result",
      },
    ],
    plugin: {
      pluginId: "dev.contentflow.datetime-consumer",
      capabilityId: "consume-datetime",
      configuration: {},
    },
    parameters: [],
    order: 2,
  };
  const methods = createEmptyMethods();
  methods.theme = {
    contractVersion: 3,
    name: "Runtime datetime",
    processType: "theme",
    blocks: [producer, review, consumer],
  };
  const channel: Channel = {
    id: "channel-datetime-runtime",
    name: "Datetime runtime",
    handle: "@datetime",
    color: "#6366f1",
    subscribers: "—",
    niche: "Teste",
    language: "pt-BR",
    activeProjects: 1,
    frequency: "Semanal",
    nextPublish: "",
    currentProjectProgress: 0,
    status: "healthy",
    trend: [],
    methods,
    createdAt: "2026-10-07T00:00:00.000Z",
  };
  const project: Project = {
    id: "project-datetime-runtime",
    title: "Runtime datetime",
    channelId: channel.id,
    currentStage: "theme",
    state: "not_started",
    progress: 0,
    deadline: "Sem prazo",
    duration: "—",
    updatedAt: "Agora",
    stages: Object.fromEntries(
      PROCESS_ORDER.map((processType) => [processType, "not_started"]),
    ) as Project["stages"],
    assignee: { name: "Teste", initials: "T" },
    thumbHue: 0,
    createdAt: "2026-10-07T00:00:00.000Z",
  };
  const db = {
    channels: [channel],
    projects: [project],
    executions: [] as ProcessExecution[],
    libraryItems: [],
    libraryCollections: [],
  };
  const commands = executionCommands(db);
  const execution = commands.startProcessExecution(project.id, "theme");
  assert.ok(execution);
  return { commands, execution, project, producer, review, consumer };
}

function resolveInputs(
  execution: ProcessExecution,
  block: ActionBlock,
  project: Project,
) {
  return resolveBlockInputs({
    block,
    execution,
    project,
    projectExecutions: [execution],
    collections: [],
    libraryItems: [],
  });
}

test("human CRIAR datetime completes and VALIDAR displays the exact producer value", () => {
  const { commands, execution, project, producer, review } = fixture();
  const scheduledAt = "2026-10-08T12:30:00.000Z";

  const completed = commands.completeHumanBlock(execution.id, producer.id, {
    scheduled_at: scheduledAt,
  });

  assert.deepEqual(completed, { ok: true, completedProcess: false });
  assert.equal(execution.blocks[0].status, "completed");
  assert.equal(execution.blocks[0].values.scheduled_at, scheduledAt);
  assert.equal(execution.blocks[1].status, "awaiting_human");
  const [input] = resolveInputs(execution, review, project);
  assert.equal(input.resolved, true);
  assert.equal(input.value, scheduledAt);
  assert.equal(input.sourceBlockId, producer.id);
});

test("VALIDAR blocks downstream until approval, then binds exact date and decision", () => {
  const { commands, execution, project, producer, review, consumer } = fixture();
  const scheduledAt = "2026-10-08T12:30:00.000Z";
  commands.completeHumanBlock(execution.id, producer.id, { scheduled_at: scheduledAt });

  assert.equal(execution.blocks[1].status, "awaiting_human");
  assert.equal(execution.blocks[2].status, "pending");
  const beforeDecision = resolveInputs(execution, consumer, project);
  assert.equal(beforeDecision.find((item) => item.input.id === "date-input")?.value, scheduledAt);
  assert.equal(beforeDecision.find((item) => item.input.id === "approval-input")?.resolved, false);

  const approved = commands.completeHumanBlock(execution.id, review.id, {
    decision: "approved",
  });

  assert.deepEqual(approved, { ok: true, completedProcess: false });
  assert.equal(execution.blocks[1].values.decision, "approved");
  assert.equal(execution.blocks[2].status, "blocked_executor");
  const afterDecision = resolveInputs(execution, consumer, project);
  assert.deepEqual(
    Object.fromEntries(afterDecision.map((item) => [item.input.id, item.value])),
    { "date-input": scheduledAt, "approval-input": "approved" },
  );
  assert.equal(afterDecision.find((item) => item.input.id === "date-input")?.value, scheduledAt);
  assert.equal(afterDecision.find((item) => item.input.id === "approval-input")?.value, "approved");
});

test("rejects invalid human inputs and retries the date target before reapproval", () => {
  const { commands, execution, project, producer, review, consumer } = fixture();
  const firstDate = "2026-10-08T12:30:00.000Z";
  const secondDate = "2026-10-09T14:45:00.000Z";

  const invalidDate = commands.completeHumanBlock(execution.id, producer.id, {
    scheduled_at: 123,
  });
  assert.equal(invalidDate.ok, false);
  assert.equal(execution.blocks[0].status, "awaiting_human");
  assert.deepEqual(execution.blocks[0].values, {});

  const completed = commands.completeHumanBlock(execution.id, producer.id, {
    scheduled_at: firstDate,
  });
  assert.equal(completed.ok, true);
  const unknownReviewField = commands.completeHumanBlock(execution.id, review.id, {
    decision: "approved",
    scheduled_at: firstDate,
  });
  assert.equal(unknownReviewField.ok, false);
  assert.equal(execution.blocks[1].status, "awaiting_human");
  assert.deepEqual(execution.blocks[1].values, {});

  const rejected = commands.completeHumanBlock(execution.id, review.id, {
    decision: "rejected",
  });
  assert.deepEqual(rejected, {
    ok: true,
    completedProcess: false,
    retriedBlock: producer.name,
  });
  assert.equal(execution.blocks[0].attempt, 2);
  assert.equal(execution.blocks[0].status, "awaiting_human");
  assert.deepEqual(execution.blocks[0].values, {});
  assert.equal(execution.blocks[1].status, "pending");
  assert.equal(execution.blocks[2].status, "pending");

  commands.completeHumanBlock(execution.id, producer.id, { scheduled_at: secondDate });
  assert.equal(resolveInputs(execution, review, project)[0].value, secondDate);
  const reapproved = commands.completeHumanBlock(execution.id, review.id, {
    decision: "approved",
  });
  assert.deepEqual(reapproved, { ok: true, completedProcess: false });
  assert.equal(execution.blocks[0].values.scheduled_at, secondDate);
  assert.equal(execution.blocks[2].status, "blocked_executor");
  const consumerInputs = resolveInputs(execution, consumer, project);
  assert.equal(consumerInputs.find((item) => item.input.id === "date-input")?.value, secondDate);
  assert.equal(
    consumerInputs.find((item) => item.input.id === "approval-input")?.value,
    "approved",
  );
});
