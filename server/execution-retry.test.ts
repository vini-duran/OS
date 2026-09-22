import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import test from "node:test";
import { attemptAfterRetryInvalidation } from "../src/lib/retry-attempt";
import { executionCommands } from "./execution-commands";
import {
  createEmptyMethods,
  PROCESS_ORDER,
  type Channel,
  type Project,
  type ProcessExecution,
} from "../src/lib/domain";

test("tentativas técnicas não esgotam as rodadas da validação humana", () => {
  const project: Project = {
    id: "project",
    channelId: "channel",
    title: "Isolated retry",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deadline: "",
    duration: "",
    assignee: { name: "", initials: "" },
    thumbHue: 0,
    stages: Object.fromEntries(
      PROCESS_ORDER.map((process) => [process, "not_started"]),
    ) as Project["stages"],
    currentStage: "theme",
    state: "awaiting_human",
    progress: 0,
  };
  const method = createEmptyMethods().theme;
  method.blocks = [
    {
      id: "create",
      type: "CRIAR",
      operator: "Humano",
      name: "Create",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 0,
    },
    {
      id: "review",
      type: "VALIDAR",
      operator: "Humano",
      name: "Review",
      inputs: [],
      outputs: [
        { id: "decision", key: "decision", label: "Decision", type: "approval", required: true },
      ],
      parameters: [],
      instructions: "",
      order: 1,
      validation: {
        mode: "approval",
        onReject: "retry_target",
        targetBlockId: "create",
        maxAttempts: 3,
        retryMode: "full",
      },
    },
  ];
  const execution: ProcessExecution = {
    id: "execution",
    projectId: project.id,
    channelId: project.channelId,
    processType: "theme",
    methodSnapshot: method,
    status: "awaiting_human",
    outputStatus: "pending",
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
    blocks: [
      { blockId: "create", status: "completed", values: {}, attempt: 9 },
      { blockId: "review", status: "awaiting_human", values: {}, attempt: 1 },
    ],
  };
  const commands = executionCommands({
    channels: [],
    projects: [project],
    executions: [execution],
    libraryItems: [],
    libraryCollections: [],
  });
  assert.equal(
    commands.completeHumanBlock(execution.id, "review", { decision: "rejected" }).ok,
    true,
  );
  assert.equal(execution.blocks[0].attempt, 10);
  assert.equal(execution.blocks[1].attempt, 2);
  execution.blocks[0].status = "completed";
  execution.blocks[1].status = "awaiting_human";
  execution.blocks[1].attempt = 3;
  assert.equal(
    commands.completeHumanBlock(execution.id, "review", { decision: "rejected" }).ok,
    false,
  );
});

test("invalida a identidade dos jobs já executados ao repetir um trecho validado", () => {
  assert.equal(
    attemptAfterRetryInvalidation({
      status: "completed",
      attempt: 1,
      completedAt: "2026-08-24T00:00:00.000Z",
    }),
    2,
  );
  assert.equal(attemptAfterRetryInvalidation({ status: "blocked_executor", attempt: 2 }), 3);
  assert.equal(attemptAfterRetryInvalidation({ status: "pending", attempt: 1 }), 1);
});

test("retry manual preserva somente o lote pendente quando solicitado", () => {
  const project: Project = {
    id: "project-batch",
    channelId: "channel",
    title: "Batch retry",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deadline: "",
    duration: "",
    assignee: { name: "", initials: "" },
    thumbHue: 0,
    stages: Object.fromEntries(
      PROCESS_ORDER.map((process) => [process, "not_started"]),
    ) as Project["stages"],
    currentStage: "assets",
    state: "error",
    progress: 0,
  };
  const method = createEmptyMethods().assets;
  method.blocks = [
    {
      id: "batch",
      type: "CRIAR",
      operator: "Código",
      name: "Batch",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 0,
    },
  ];
  const execution: ProcessExecution = {
    id: "execution-batch",
    projectId: project.id,
    channelId: project.channelId,
    processType: "assets",
    methodSnapshot: method,
    status: "failed",
    outputStatus: "pending",
    error: "Falha no item 3",
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
    blocks: [
      {
        blockId: "batch",
        status: "failed",
        values: { images: ["a", "b"] },
        attempt: 1,
        itemProgress: { total: 4, completed: 2, pending: 2, currentIndex: 2, failedIndex: 2 },
      },
    ],
  };
  const commands = executionCommands({
    channels: [],
    projects: [project],
    executions: [execution],
    libraryItems: [],
    libraryCollections: [],
  });

  assert.equal(commands.retryBlockExecution(execution.id, "batch", "remaining"), true);
  assert.equal(execution.blocks[0].attempt, 2);
  assert.equal(execution.blocks[0].itemRetryScope, "remaining");
  assert.deepEqual(execution.blocks[0].values, { images: ["a", "b"] });
  assert.equal(execution.blocks[0].itemProgress?.completed, 2);
  assert.equal(execution.blocks[0].progress, 0.5);

  execution.blocks[0].status = "failed";
  assert.equal(commands.retryBlockExecution(execution.id, "batch", "all"), true);
  assert.equal(execution.blocks[0].attempt, 3);
  assert.equal(execution.blocks[0].itemRetryScope, "all");
  assert.deepEqual(execution.blocks[0].values, {});
  assert.equal(execution.blocks[0].itemProgress, undefined);
  assert.equal(execution.blocks[0].progress, undefined);
});

test("regenera um único item de um bloco já concluído sem apagar os demais", () => {
  const project: Project = {
    id: "project-selected-item",
    channelId: "channel",
    title: "Selected item retry",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deadline: "",
    duration: "",
    assignee: { name: "", initials: "" },
    thumbHue: 0,
    stages: Object.fromEntries(
      PROCESS_ORDER.map((process) => [process, process === "assets" ? "done" : "not_started"]),
    ) as Project["stages"],
    currentStage: "assets",
    state: "done",
    progress: 75,
  };
  const method = createEmptyMethods().assets;
  method.blocks = [
    {
      id: "images",
      type: "CRIAR",
      operator: "Código",
      name: "Imagens",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 0,
    },
  ];
  const execution: ProcessExecution = {
    id: "execution-selected-item",
    projectId: project.id,
    channelId: project.channelId,
    processType: "assets",
    methodSnapshot: method,
    status: "completed",
    outputStatus: "completed",
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
    blocks: [
      {
        blockId: "images",
        status: "completed",
        values: { images: ["a", "b"] },
        attempt: 1,
        items: [
          {
            id: "item-a",
            order: 0,
            input: "prompt-a",
            status: "completed",
            attempt: 1,
            output: "a",
            attempts: [],
          },
          {
            id: "item-b",
            order: 1,
            input: "prompt-b",
            status: "completed",
            attempt: 1,
            output: "b",
            attempts: [],
          },
        ],
        itemProgress: { total: 2, completed: 2, pending: 0 },
      },
    ],
  };
  const commands = executionCommands({
    channels: [],
    projects: [project],
    executions: [execution],
    libraryItems: [],
    libraryCollections: [],
  });

  assert.equal(commands.retryBlockExecution(execution.id, "images", "selected", "item-b"), true);
  assert.equal(execution.blocks[0].attempt, 2);
  assert.equal(execution.blocks[0].itemRetryScope, "selected");
  assert.equal(execution.blocks[0].itemRetryId, "item-b");
  assert.deepEqual(execution.blocks[0].values, { images: ["a", "b"] });
  assert.equal(execution.blocks[0].items?.[0].output, "a");
  assert.equal(execution.blocks[0].items?.[1].output, "b");
});

test("aceita a entrega persistida de um bloco cancelado sem refazer blocos anteriores", () => {
  const project: Project = {
    id: "project-cancelled-assets",
    channelId: "channel",
    title: "Cancelled assets",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deadline: "",
    duration: "",
    assignee: { name: "", initials: "" },
    thumbHue: 0,
    stages: Object.fromEntries(
      PROCESS_ORDER.map((process) => [process, process === "assets" ? "not_started" : "done"]),
    ) as Project["stages"],
    currentStage: "assets",
    state: "not_started",
    progress: 63,
  };
  const method = createEmptyMethods().assets;
  method.blocks = [
    {
      id: "srt",
      type: "CRIAR",
      operator: "Código",
      name: "Criar SRT",
      inputs: [],
      outputs: [{ id: "srt-output", key: "srt", label: "SRT", type: "text", required: true }],
      parameters: [],
      instructions: "",
      order: 0,
    },
    {
      id: "prompts",
      type: "CRIAR",
      operator: "IA",
      name: "Criar prompts",
      inputs: [],
      outputs: [
        { id: "prompts-output", key: "prompts", label: "Prompts", type: "list", required: true },
      ],
      parameters: [],
      instructions: "",
      order: 1,
    },
    {
      id: "images",
      type: "CRIAR",
      operator: "IA",
      name: "Criar imagens",
      inputs: [],
      outputs: [
        { id: "assets-output", key: "assets", label: "Assets", type: "files", required: true },
      ],
      parameters: [],
      instructions: "",
      order: 2,
    },
  ];
  const images = Array.from({ length: 124 }, (_, index) => ({
    id: `image-${index + 1}`,
    name: `${index + 1}.jpg`,
    mimeType: "image/jpeg",
    size: 100,
    url: `/api/files/${index + 1}.jpg`,
  }));
  const execution: ProcessExecution = {
    id: "execution-cancelled-assets",
    projectId: project.id,
    channelId: project.channelId,
    processType: "assets",
    methodSnapshot: method,
    status: "cancelled",
    outputStatus: "pending",
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
    blocks: [
      { blockId: "srt", status: "completed", values: { srt: "ok" }, attempt: 1 },
      { blockId: "prompts", status: "completed", values: { prompts: ["a", "b"] }, attempt: 1 },
      { blockId: "images", status: "cancelled", values: { assets: images }, attempt: 7 },
    ],
  };
  const commands = executionCommands({
    channels: [],
    projects: [project],
    executions: [execution],
    libraryItems: [],
    libraryCollections: [],
  });

  const result = commands.acceptBlockDelivery(execution.id, "images");
  assert.deepEqual(result, { ok: true, completedProcess: true });
  assert.equal(execution.blocks[0].status, "completed");
  assert.equal(execution.blocks[0].attempt, 1);
  assert.equal(execution.blocks[1].status, "completed");
  assert.equal(execution.blocks[1].attempt, 1);
  assert.equal(execution.blocks[2].status, "completed");
  assert.equal(execution.blocks[2].attempt, 7);
  assert.equal((execution.blocks[2].values.assets as typeof images).length, 124);
  assert.equal(execution.status, "completed");
  assert.equal(execution.outputStatus, "completed");
  assert.equal((execution.output?.values.assets as typeof images).length, 124);
  assert.equal(project.stages.assets, "done");
});

test("refaz somente o bloco cancelado e mantém os anteriores consolidados", () => {
  const project: Project = {
    id: "project-rerun-cancelled",
    channelId: "channel",
    title: "Rerun cancelled block",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deadline: "",
    duration: "",
    assignee: { name: "", initials: "" },
    thumbHue: 0,
    stages: Object.fromEntries(
      PROCESS_ORDER.map((process) => [process, process === "assets" ? "not_started" : "done"]),
    ) as Project["stages"],
    currentStage: "assets",
    state: "not_started",
    progress: 63,
  };
  const method = createEmptyMethods().assets;
  method.blocks = [
    {
      id: "srt",
      type: "CRIAR",
      operator: "Código",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 0,
    },
    {
      id: "prompts",
      type: "CRIAR",
      operator: "IA",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 1,
    },
    {
      id: "images",
      type: "CRIAR",
      operator: "IA",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 2,
    },
  ];
  const execution: ProcessExecution = {
    id: "execution-rerun-cancelled",
    projectId: project.id,
    channelId: project.channelId,
    processType: "assets",
    methodSnapshot: method,
    status: "cancelled",
    outputStatus: "pending",
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
    blocks: [
      { blockId: "srt", status: "completed", values: { srt: "preservado" }, attempt: 1 },
      {
        blockId: "prompts",
        status: "completed",
        values: { prompts: ["preservado"] },
        attempt: 1,
      },
      { blockId: "images", status: "cancelled", values: { assets: ["parcial"] }, attempt: 7 },
    ],
  };
  const commands = executionCommands({
    channels: [],
    projects: [project],
    executions: [execution],
    libraryItems: [],
    libraryCollections: [],
  });

  assert.equal(commands.retryBlockExecution(execution.id, "images", "all"), true);
  assert.deepEqual(execution.blocks[0].values, { srt: "preservado" });
  assert.equal(execution.blocks[0].attempt, 1);
  assert.deepEqual(execution.blocks[1].values, { prompts: ["preservado"] });
  assert.equal(execution.blocks[1].attempt, 1);
  assert.equal(execution.blocks[2].status, "blocked_executor");
  assert.equal(execution.blocks[2].attempt, 8);
  assert.deepEqual(execution.blocks[2].values, {});
  assert.equal(execution.status, "blocked_executor");
  assert.equal(project.stages.assets, "blocked");
});

test("retry comum sem snapshot continua funcionando, mas NÃO emite autorização externa", () => {
  const project: Project = {
    id: "project-common-retry",
    channelId: "channel-1",
    title: "Common retry project",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deadline: "",
    duration: "",
    assignee: { name: "", initials: "" },
    thumbHue: 0,
    stages: Object.fromEntries(
      PROCESS_ORDER.map((process) => [process, "not_started"]),
    ) as Project["stages"],
    currentStage: "thumbnail",
    state: "error",
    progress: 0,
  };
  const method = createEmptyMethods().thumbnail;
  method.blocks = [
    {
      id: "thumb-create",
      type: "CRIAR",
      operator: "Código",
      name: "Generate Thumbnail",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 0,
    },
  ];
  const execution: ProcessExecution = {
    id: "exec-common-retry-1",
    projectId: project.id,
    channelId: project.channelId,
    processType: "thumbnail",
    methodSnapshot: method,
    status: "failed",
    outputStatus: "pending",
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
    blocks: [
      {
        blockId: "thumb-create",
        status: "failed",
        values: {},
        attempt: 1,
        error: "Falha comum sem snapshot",
      },
    ],
  };
  const commands = executionCommands({
    channels: [],
    projects: [project],
    executions: [execution],
    libraryItems: [],
    libraryCollections: [],
  });

  // Retry comum sem snapshot nem confirmação
  const retried = commands.retryBlockExecution(execution.id, "thumb-create");
  assert.equal(retried, true);
  const blockExecution = execution.blocks[0];
  assert.equal(blockExecution.attempt, 2);
  assert.equal(blockExecution.status, "blocked_executor");
  assert.equal(blockExecution.error, undefined);
  // NÃO emite autorização externa
  assert.equal(blockExecution.recoveryAuthorization, undefined);
  assert.equal(blockExecution.recoveryHistory, undefined);
});

test("ação humana explícita com snapshot e confirmação válida emite autorização assinada com Ed25519 e alvo completo, recusando revisão divergente", () => {
  const project: Project = {
    id: "project-retry",
    channelId: "channel-1",
    title: "Explicit retry project",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deadline: "",
    duration: "",
    assignee: { name: "", initials: "" },
    thumbHue: 0,
    stages: Object.fromEntries(
      PROCESS_ORDER.map((process) => [process, "not_started"]),
    ) as Project["stages"],
    currentStage: "thumbnail",
    state: "error",
    progress: 0,
  };
  const method = createEmptyMethods().thumbnail;
  method.blocks = [
    {
      id: "thumb-create",
      type: "CRIAR",
      operator: "Código",
      name: "Generate Thumbnail",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 0,
    },
  ];
  const execution: ProcessExecution = {
    id: "exec-retry-1",
    projectId: project.id,
    channelId: project.channelId,
    processType: "thumbnail",
    methodSnapshot: method,
    status: "failed",
    outputStatus: "pending",
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
    blocks: [
      {
        blockId: "thumb-create",
        status: "failed",
        values: {},
        attempt: 1,
        error: "Falha externa com snapshot",
        recoverySnapshot: {
          format: "contentflow-external-recovery-snapshot-v1",
          system: "generic_worker_bridge",
          runId: "run_alpha",
          targetId: "layout_01",
          cycle: 1,
          snapshotRevision: "rev-orig-999",
          recordedAt: new Date().toISOString(),
        },
      },
    ],
  };
  const commands = executionCommands({
    channels: [],
    projects: [project],
    executions: [execution],
    libraryItems: [],
    libraryCollections: [],
  });

  // 1a. Confirmação ausente com snapshot pendente: recusa no engine e preserva snapshot, erro, attempt e status
  const missingConfirm = commands.retryBlockExecution(execution.id, "thumb-create");
  assert.equal(missingConfirm, false);
  assert.equal(execution.blocks[0].attempt, 1);
  assert.equal(execution.blocks[0].status, "failed");
  assert.equal(execution.blocks[0].error, "Falha externa com snapshot");
  assert.equal(execution.blocks[0].recoverySnapshot?.snapshotRevision, "rev-orig-999");
  assert.equal(execution.blocks[0].recoveryAuthorization, undefined);

  // 1b. Confirmação com revisão divergente: recusa e preserva estado
  const divergent = commands.retryBlockExecution(execution.id, "thumb-create", {
    confirmSnapshotRevision: "rev-divergent",
  });
  assert.equal(divergent, false);
  assert.equal(execution.blocks[0].attempt, 1);
  assert.equal(execution.blocks[0].status, "failed");
  assert.equal(execution.blocks[0].error, "Falha externa com snapshot");
  assert.equal(execution.blocks[0].recoverySnapshot?.snapshotRevision, "rev-orig-999");
  assert.equal(execution.blocks[0].recoveryAuthorization, undefined);

  // 2. Confirmação com revisão válida correspondente
  const retried = commands.retryBlockExecution(execution.id, "thumb-create", {
    confirmSnapshotRevision: "rev-orig-999",
  });
  assert.equal(retried, true);
  const blockExecution = execution.blocks[0];
  assert.equal(blockExecution.attempt, 2);
  assert.equal(blockExecution.status, "blocked_executor");
  assert.equal(blockExecution.error, undefined);
  assert.ok(blockExecution.recoveryAuthorization);
  assert.equal(blockExecution.recoveryAuthorization.version, "1");
  assert.equal(blockExecution.recoveryAuthorization.origin, "user_action");
  assert.equal(blockExecution.recoveryAuthorization.algorithm, "ed25519");
  assert.ok(blockExecution.recoveryAuthorization.keyId.startsWith("core_ed25519_"));
  assert.equal(blockExecution.recoveryAuthorization.target.executionId, "exec-retry-1");
  assert.equal(blockExecution.recoveryAuthorization.target.blockId, "thumb-create");
  assert.equal(blockExecution.recoveryAuthorization.target.attempt, 2);
  assert.deepEqual(blockExecution.recoveryAuthorization.target.externalTarget, {
    system: "generic_worker_bridge",
    runId: "run_alpha",
    targetId: "layout_01",
    cycle: 1,
    snapshotRevision: "rev-orig-999",
  });
  assert.ok(typeof blockExecution.recoveryAuthorization.token === "string");
  assert.ok(typeof blockExecution.recoveryAuthorization.signature === "string");
  assert.ok(blockExecution.recoveryAuthorization.signature.length > 0);
  assert.equal(blockExecution.recoveryHistory?.length, 1);
  assert.deepEqual(blockExecution.recoveryHistory[0], blockExecution.recoveryAuthorization);
  // Snapshot consumido é limpo no bloco
  assert.equal(blockExecution.recoverySnapshot, undefined);

  // Repetição da solicitação: chamada subsequente deve ser recusada e não emitir nova autorização
  const repeated = commands.retryBlockExecution(execution.id, "thumb-create", {
    confirmSnapshotRevision: "rev-orig-999",
  });
  assert.equal(repeated, false);
  assert.equal(blockExecution.attempt, 2);
  assert.equal(blockExecution.recoveryHistory?.length, 1);

  // Reinício / reidratação: restauração do estado serializado preserva identidade sem minting
  const rehydrated = JSON.parse(JSON.stringify(execution)) as ProcessExecution;
  assert.equal(
    rehydrated.blocks[0].recoveryAuthorization?.token,
    blockExecution.recoveryAuthorization.token,
  );
  assert.equal(
    rehydrated.blocks[0].recoveryAuthorization?.signature,
    blockExecution.recoveryAuthorization.signature,
  );
  assert.equal(rehydrated.blocks[0].recoveryAuthorization?.target.attempt, 2);
});

test("rejeição em validação (retryValidatedBlock) não emite autorização de recuperação e limpa anterior", () => {
  const project: Project = {
    id: "project-val",
    channelId: "channel-1",
    title: "Validation rejection",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deadline: "",
    duration: "",
    assignee: { name: "", initials: "" },
    thumbHue: 0,
    stages: Object.fromEntries(
      PROCESS_ORDER.map((process) => [process, "not_started"]),
    ) as Project["stages"],
    currentStage: "theme",
    state: "awaiting_human",
    progress: 0,
  };
  const method = createEmptyMethods().theme;
  method.blocks = [
    {
      id: "create-block",
      type: "CRIAR",
      operator: "Código",
      name: "Create",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 0,
    },
    {
      id: "val-block",
      type: "VALIDAR",
      operator: "Humano",
      name: "Validate",
      inputs: [],
      outputs: [
        { id: "decision", key: "decision", label: "Decision", type: "approval", required: true },
      ],
      parameters: [],
      instructions: "",
      order: 1,
      validation: {
        mode: "approval",
        onReject: "retry_target",
        targetBlockId: "create-block",
        maxAttempts: 3,
        retryMode: "full",
      },
    },
  ];
  const execution: ProcessExecution = {
    id: "exec-val-1",
    projectId: project.id,
    channelId: project.channelId,
    processType: "theme",
    methodSnapshot: method,
    status: "awaiting_human",
    outputStatus: "pending",
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
    blocks: [
      {
        blockId: "create-block",
        status: "completed",
        values: {},
        attempt: 2,
        recoveryAuthorization: {
          version: "1",
          token: "old-token",
          authorizedAt: new Date().toISOString(),
          origin: "user_action",
          keyId: "core_ed25519_old",
          algorithm: "ed25519",
          target: { executionId: "exec-val-1", blockId: "create-block", attempt: 2 },
          signature: "b2xkLXNpZw==",
        },
      },
      { blockId: "val-block", status: "awaiting_human", values: {}, attempt: 1 },
    ],
  };
  const commands = executionCommands({
    channels: [],
    projects: [project],
    executions: [execution],
    libraryItems: [],
    libraryCollections: [],
  });

  const result = commands.completeHumanBlock(execution.id, "val-block", { decision: "rejected" });
  assert.equal(result.ok, true);
  // O bloco alvo foi invalidado e teve tentativa incrementada, mas recoveryAuthorization é estritamente undefined
  assert.equal(execution.blocks[0].attempt, 3);
  assert.equal(execution.blocks[0].recoveryAuthorization, undefined);
});

async function availablePort(): Promise<number> {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

async function waitForApi(baseUrl: string, child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`A API encerrou com código ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/channels`);
      if (response.ok) return;
    } catch {
      // aguarda inicialização
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("A API isolada não inicializou dentro do prazo.");
}

async function jsonRequest<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
): Promise<{ response: Response; body: T & { error?: string } }> {
  const response = await fetch(url, init);
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string });
  return { response, body };
}

function spawnServer(port: number, dataDirectory: string): ChildProcess {
  const nodeBinary = existsSync("/Users/viniciusduran/.nvm/versions/node/v26.7.0/bin/node")
    ? "/Users/viniciusduran/.nvm/versions/node/v26.7.0/bin/node"
    : process.execPath;
  return spawn(nodeBinary, ["--import", "tsx", "server/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CONTENTFLOW_API_PORT: String(port),
      CONTENTFLOW_DATA_DIR: dataDirectory,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

async function stopServer(child: ChildProcess): Promise<void> {
  child.kill();
  if (child.exitCode === null) {
    await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 3_000))]);
  }
}

test(
  "armazenamento real em ambiente isolado: salva e reabre, preserva autorização e histórico, rejeita replay obsoleto pelo mecanismo real de staleness e aceita nova ação explícita com attempt vigente",
  { timeout: 30_000 },
  async () => {
    const dataDirectory = mkdtempSync(path.join(os.tmpdir(), "contentflow-retry-real-"));
    let port = await availablePort();
    let baseUrl = `http://127.0.0.1:${port}`;
    let child = spawnServer(port, dataDirectory);

    try {
      await waitForApi(baseUrl, child);

      // 1. Cadastrar canal, projeto e execução com bloco falhado (attempt 1)
      const channel = {
        id: "channel-retry-real",
        name: "Canal Retry Real",
        handle: "@retry-real",
        color: "#2563eb",
        subscribers: "0",
        niche: "Testes",
        language: "pt-BR",
        activeProjects: 0,
        frequency: "Semanal",
        nextPublish: "—",
        currentProjectProgress: 0,
        status: "healthy" as const,
        trend: [],
        createdAt: new Date().toISOString(),
        methods: Object.fromEntries(
          PROCESS_ORDER.map((processType) => [
            processType,
            {
              processType,
              blocks: [
                {
                  id: "thumb-block",
                  type: "CRIAR" as const,
                  operator: "Código" as const,
                  name: "Gerar Thumb",
                  inputs: [],
                  outputs: [],
                  parameters: [],
                  order: 0,
                },
              ],
            },
          ]),
        ) as unknown as Channel["methods"],
      };
      await jsonRequest(`${baseUrl}/api/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channel),
      });

      const project: Project = {
        id: "project-retry-real",
        channelId: channel.id,
        title: "Projeto Retry Real",
        deadline: "Sem prazo",
        duration: "—",
        assignee: { name: "Tester", initials: "T" },
        thumbHue: 0,
        stages: Object.fromEntries(
          PROCESS_ORDER.map((p) => [p, "not_started"]),
        ) as Project["stages"],
        currentStage: "thumbnail",
        state: "error",
        progress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await jsonRequest(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });

      const execution: ProcessExecution = {
        id: "exec-retry-real",
        channelId: channel.id,
        projectId: project.id,
        processType: "thumbnail",
        status: "failed",
        outputStatus: "pending",
        methodSnapshot: channel.methods.thumbnail,
        blocks: [
          {
            blockId: "thumb-block",
            status: "failed",
            attempt: 1,
            values: {},
            error: "Erro no provedor",
            recoverySnapshot: {
              format: "contentflow-external-recovery-snapshot-v1",
              system: "generic_worker_bridge",
              runId: "run_isolated_1",
              targetId: "layout_01",
              cycle: 1,
              snapshotRevision: "rev-iso-1",
              recordedAt: new Date().toISOString(),
            },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await jsonRequest(`${baseUrl}/api/executions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(execution),
      });

      // 2a. Rejeitar retry sem confirmSnapshotRevision (confirmação ausente com snapshot pendente)
      const missingConfirmCommandId = crypto.randomUUID();
      const missingConfirmRes = await jsonRequest(`${baseUrl}/api/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: missingConfirmCommandId,
          action: "retry",
          executionId: execution.id,
          blockId: "thumb-block",
          attempt: 1,
        }),
      });
      assert.equal(missingConfirmRes.response.status, 409);
      assert.match(
        missingConfirmRes.body.error ?? "",
        /revisão de recuperação divergiu ou está pendente/,
      );

      // Verifica preservação completa após recusa por ausência
      const stateAfterMissing = (
        await jsonRequest<{ executions: ProcessExecution[] }>(`${baseUrl}/api/state`)
      ).body.executions.find((e) => e.id === execution.id)!;
      assert.equal(stateAfterMissing.blocks[0].attempt, 1);
      assert.equal(stateAfterMissing.blocks[0].status, "failed");
      assert.equal(stateAfterMissing.blocks[0].error, "Erro no provedor");
      assert.equal(stateAfterMissing.blocks[0].recoverySnapshot?.snapshotRevision, "rev-iso-1");
      assert.equal(stateAfterMissing.blocks[0].recoveryAuthorization, undefined);

      // 2b. Rejeitar retry com confirmSnapshotRevision divergente
      const divergentCommandId = crypto.randomUUID();
      const divergentRes = await jsonRequest(`${baseUrl}/api/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: divergentCommandId,
          action: "retry",
          executionId: execution.id,
          blockId: "thumb-block",
          attempt: 1,
          confirmSnapshotRevision: "rev-divergent",
        }),
      });
      assert.equal(divergentRes.response.status, 409);
      assert.match(divergentRes.body.error ?? "", /revisão de recuperação divergiu/);

      // Verifica preservação completa após recusa por divergência
      const stateAfterDivergent = (
        await jsonRequest<{ executions: ProcessExecution[] }>(`${baseUrl}/api/state`)
      ).body.executions.find((e) => e.id === execution.id)!;
      assert.equal(stateAfterDivergent.blocks[0].attempt, 1);
      assert.equal(stateAfterDivergent.blocks[0].status, "failed");
      assert.equal(stateAfterDivergent.blocks[0].error, "Erro no provedor");
      assert.equal(stateAfterDivergent.blocks[0].recoverySnapshot?.snapshotRevision, "rev-iso-1");
      assert.equal(stateAfterDivergent.blocks[0].recoveryAuthorization, undefined);

      // 2c. Executar retry explícito via /api/commands com confirmSnapshotRevision correto e attempt vigente (1)
      const firstCommandId = crypto.randomUUID();
      const firstRetryRes = await jsonRequest<{
        result: unknown;
        state: { executions: ProcessExecution[] };
      }>(`${baseUrl}/api/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: firstCommandId,
          action: "retry",
          executionId: execution.id,
          blockId: "thumb-block",
          attempt: 1,
          confirmSnapshotRevision: "rev-iso-1",
        }),
      });
      assert.equal(firstRetryRes.response.status, 200, firstRetryRes.body.error);
      const stateAfterFirst = firstRetryRes.body.state.executions.find(
        (e) => e.id === execution.id,
      )!;
      assert.equal(stateAfterFirst.blocks[0].attempt, 2);
      const firstAuth = stateAfterFirst.blocks[0].recoveryAuthorization;
      assert.ok(firstAuth);
      assert.equal(firstAuth.version, "1");
      assert.equal(firstAuth.algorithm, "ed25519");
      assert.ok(firstAuth.keyId.startsWith("core_ed25519_"));
      assert.equal(firstAuth.origin, "user_action");
      assert.equal(firstAuth.target.attempt, 2);
      assert.deepEqual(firstAuth.target.externalTarget, {
        system: "generic_worker_bridge",
        runId: "run_isolated_1",
        targetId: "layout_01",
        cycle: 1,
        snapshotRevision: "rev-iso-1",
      });
      assert.ok(typeof firstAuth.signature === "string" && firstAuth.signature.length > 0);
      assert.equal(stateAfterFirst.blocks[0].recoveryHistory?.length, 1);

      // 3. Replay do mesmo comando (mesmo ID): retorna recibo sem emitir nova autorização
      const replaySameIdRes = await jsonRequest<{ result: unknown }>(`${baseUrl}/api/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: firstCommandId,
          action: "retry",
          executionId: execution.id,
          blockId: "thumb-block",
          attempt: 1,
          confirmSnapshotRevision: "rev-iso-1",
        }),
      });
      assert.equal(replaySameIdRes.response.status, 200);

      // 4. Salvar e reabrir pelo armazenamento real (reiniciar servidor apontando para o mesmo dataDirectory)
      await stopServer(child);
      port = await availablePort();
      baseUrl = `http://127.0.0.1:${port}`;
      child = spawnServer(port, dataDirectory);
      await waitForApi(baseUrl, child);

      // 5. Preservar token e histórico sem emitir nova autorização na reabertura
      const reopenedStateRes = await jsonRequest<{ executions: ProcessExecution[] }>(
        `${baseUrl}/api/state`,
      );
      assert.equal(reopenedStateRes.response.status, 200);
      const reopenedExec = reopenedStateRes.body.executions.find((e) => e.id === execution.id)!;
      assert.ok(reopenedExec);
      const reopenedBlock = reopenedExec.blocks[0];
      assert.equal(reopenedBlock.attempt, 2);
      assert.equal(reopenedBlock.recoveryAuthorization?.token, firstAuth.token);
      assert.equal(reopenedBlock.recoveryAuthorization?.signature, firstAuth.signature);
      assert.equal(reopenedBlock.recoveryAuthorization?.target.attempt, 2);
      assert.equal(reopenedBlock.recoveryHistory?.length, 1);
      assert.deepEqual(reopenedBlock.recoveryHistory?.[0], firstAuth);

      // 6. Nova falha na tentativa 2 com novo snapshot
      reopenedBlock.status = "failed";
      reopenedBlock.error = "Segunda falha no provedor";
      reopenedBlock.recoverySnapshot = {
        format: "contentflow-external-recovery-snapshot-v1",
        system: "generic_worker_bridge",
        runId: "run_isolated_1",
        targetId: "layout_01",
        cycle: 2,
        snapshotRevision: "rev-iso-2",
        recordedAt: new Date().toISOString(),
      };
      reopenedExec.updatedAt = new Date().toISOString();
      const updateRes = await jsonRequest(`${baseUrl}/api/executions/${reopenedExec.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reopenedExec),
      });
      assert.equal(updateRes.response.status, 200, updateRes.body.error);

      // 7. Rejeitar replay do comando antigo (novo UUID, mas attempt 1 obsoleto contra bloco no attempt 2)
      // Usando o mecanismo real de staleness do /api/commands:
      const staleReplayCommandId = crypto.randomUUID();
      const staleRes = await jsonRequest(`${baseUrl}/api/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: staleReplayCommandId,
          action: "retry",
          executionId: reopenedExec.id,
          blockId: "thumb-block",
          attempt: 1, // obsoleto; bloco está em attempt 2
          confirmSnapshotRevision: "rev-iso-2",
        }),
      });
      assert.equal(staleRes.response.status, 409);
      assert.match(staleRes.body.error ?? "", /Esta etapa mudou/);

      // 8. Permitir nova autorização somente para nova ação explícita com attempt vigente (2) e revisão confirmada
      const validSecondCommandId = crypto.randomUUID();
      const validSecondRes = await jsonRequest<{
        result: unknown;
        state: { executions: ProcessExecution[] };
      }>(`${baseUrl}/api/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: validSecondCommandId,
          action: "retry",
          executionId: reopenedExec.id,
          blockId: "thumb-block",
          attempt: 2, // vigente
          confirmSnapshotRevision: "rev-iso-2",
        }),
      });
      assert.equal(validSecondRes.response.status, 200, validSecondRes.body.error);
      const stateAfterSecond = validSecondRes.body.state.executions.find(
        (e) => e.id === execution.id,
      )!;
      const secondBlock = stateAfterSecond.blocks[0];
      assert.equal(secondBlock.attempt, 3);
      assert.ok(secondBlock.recoveryAuthorization);
      assert.equal(secondBlock.recoveryAuthorization.version, "1");
      assert.equal(secondBlock.recoveryAuthorization.algorithm, "ed25519");
      assert.equal(secondBlock.recoveryAuthorization.target.attempt, 3);
      assert.deepEqual(secondBlock.recoveryAuthorization.target.externalTarget, {
        system: "generic_worker_bridge",
        runId: "run_isolated_1",
        targetId: "layout_01",
        cycle: 2,
        snapshotRevision: "rev-iso-2",
      });
      assert.notEqual(secondBlock.recoveryAuthorization.token, firstAuth.token);
      assert.equal(secondBlock.recoveryHistory?.length, 2);
      assert.deepEqual(secondBlock.recoveryHistory?.[0], firstAuth);
      assert.deepEqual(secondBlock.recoveryHistory?.[1], secondBlock.recoveryAuthorization);
      assert.deepEqual(secondBlock.recoveryHistory?.[1], secondBlock.recoveryAuthorization);
    } finally {
      await stopServer(child);
      rmSync(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  },
);
