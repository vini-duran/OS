import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import test from "node:test";
import {
  PROCESS_ORDER,
  type Channel,
  type ProcessExecution,
  type Project,
  type UniversalProcess,
} from "../src/lib/domain";
import { attemptAfterRetryInvalidation } from "../src/lib/retry-attempt";

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
      // API ainda inicializando
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("A API de teste isolada não iniciou dentro do prazo.");
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<{ response: Response; body: T & { error?: string } }> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T & { error?: string };
  return { response, body };
}

function createTestChannel(id = "channel-hydration-test"): Channel {
  const createdAt = new Date().toISOString();
  return {
    id,
    name: "Canal de Teste Hidratação",
    handle: "@hydration-test",
    color: "#2563eb",
    subscribers: "0 inscritos",
    niche: "Testes",
    language: "PT-BR",
    activeProjects: 0,
    frequency: "Semanal",
    nextPublish: "—",
    currentProjectProgress: 0,
    status: "healthy",
    trend: [],
    createdAt,
    methods: Object.fromEntries(
      PROCESS_ORDER.map((processType) => [
        processType,
        {
          processType,
          blocks: [
            {
              id: `${processType}-gen`,
              type: "CRIAR",
              operator: "Código",
              name: `Gerar ${processType}`,
              inputs: [],
              outputs: [{ id: "images", key: "images", label: "Imagens", type: "list", required: true }],
              parameters: [],
              order: 0,
            },
            {
              id: `${processType}-select`,
              type: "SELECIONAR",
              operator: "Humano",
              name: `Selecionar ${processType}`,
              inputs: [],
              outputs: [{ id: "selected", key: "selected_values", label: "Selecionados", type: "list", required: true }],
              parameters: [],
              order: 1,
            },
            {
              id: `${processType}-promote`,
              type: "PUBLICAR",
              operator: "Código",
              name: `Promover ${processType}`,
              inputs: [],
              outputs: [],
              parameters: [],
              order: 2,
            },
          ],
        },
      ]),
    ) as unknown as Channel["methods"],
  };
}

function createTestProject(channelId: string, id = "project-hydration-test"): Project {
  const createdAt = new Date().toISOString();
  return {
    id,
    channelId,
    title: "Projeto de Teste Hidratação",
    deadline: "Sem prazo",
    duration: "—",
    assignee: { name: "Tester", initials: "T" },
    thumbHue: 0,
    stages: Object.fromEntries(PROCESS_ORDER.map((p) => [p, "not_started"])) as Project["stages"],
    currentStage: "thumbnail",
    state: "processing",
    progress: 0,
    createdAt,
    updatedAt: createdAt,
  };
}

function createTestExecution(
  channelId: string,
  projectId: string,
  methodSnapshot: Channel["methods"]["thumbnail"],
  id = "execution-hydration-test",
): ProcessExecution {
  const now = new Date().toISOString();
  return {
    id,
    channelId,
    projectId,
    processType: "thumbnail",
    status: "awaiting_human",
    outputStatus: "pending",
    methodSnapshot: structuredClone(methodSnapshot),
    blocks: [
      {
        blockId: "thumbnail-gen",
        status: "completed",
        attempt: 2,
        values: { images: ["thumb_opt1.png", "thumb_opt2.png", "thumb_opt3.png"] },
        startedAt: now,
        completedAt: now,
      },
      {
        blockId: "thumbnail-select",
        status: "awaiting_human",
        attempt: 2,
        values: { selected_values: ["thumb_opt1.png", "thumb_opt3.png"] },
        startedAt: now,
      },
      {
        blockId: "thumbnail-promote",
        status: "pending",
        attempt: 3,
        values: {},
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

test(
  "execução real em ambiente isolado: hidratação, salvamento e edição preservam seleções, entregas e tentativas",
  { timeout: 30_000 },
  async () => {
    const port = await availablePort();
    const dataDirectory = mkdtempSync(path.join(os.tmpdir(), "contentflow-hydration-test-"));
    const baseUrl = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CONTENTFLOW_API_PORT: String(port),
        CONTENTFLOW_DATA_DIR: dataDirectory,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let serverLogs = "";
    child.stdout?.on("data", (chunk) => (serverLogs += chunk.toString()));
    child.stderr?.on("data", (chunk) => (serverLogs += chunk.toString()));

    try {
      await waitForApi(baseUrl, child);

      // 1. Cadastrar canal, projeto e execução com entregas e seleções reais
      const channel = createTestChannel();
      const channelRes = await jsonRequest<Channel>(`${baseUrl}/api/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channel),
      });
      assert.equal(channelRes.response.status, 201, channelRes.body.error);

      const project = createTestProject(channel.id);
      const projectRes = await jsonRequest<Project>(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      assert.equal(projectRes.response.status, 201, projectRes.body.error);

      const execution = createTestExecution(channel.id, project.id, channel.methods.thumbnail);
      const executionRes = await jsonRequest<ProcessExecution>(`${baseUrl}/api/executions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(execution),
      });
      assert.equal(executionRes.response.status, 201, executionRes.body.error);

      // 2. Hidratação real via GET /api/state a partir do banco SQLite isolado
      const stateRes = await jsonRequest<{
        channels: Channel[];
        executions: ProcessExecution[];
        projects: Project[];
      }>(`${baseUrl}/api/state`);
      assert.equal(stateRes.response.status, 200, stateRes.body.error);

      const hydratedExecution = stateRes.body.executions.find((e) => e.id === execution.id);
      assert.ok(hydratedExecution, "Execução não retornada em /api/state");
      assert.equal(hydratedExecution.status, "awaiting_human");
      assert.deepEqual(hydratedExecution.blocks[0].values.images, [
        "thumb_opt1.png",
        "thumb_opt2.png",
        "thumb_opt3.png",
      ]);
      assert.deepEqual(hydratedExecution.blocks[1].values.selected_values, [
        "thumb_opt1.png",
        "thumb_opt3.png",
      ]);
      assert.equal(hydratedExecution.blocks[2].attempt, 3);

      // 3. Salvar Método inalterado via PUT /api/channels/:id/methods/:processType
      const unchangedMethodRes = await jsonRequest<Channel["methods"]["thumbnail"]>(
        `${baseUrl}/api/channels/${channel.id}/methods/thumbnail`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(channel.methods.thumbnail),
        },
      );
      assert.equal(unchangedMethodRes.response.status, 200, unchangedMethodRes.body.error);

      // Comprova que o estado da execução em andamento não foi reiniciado ou corrompido
      const afterUnchangedState = await jsonRequest<{ executions: ProcessExecution[] }>(
        `${baseUrl}/api/state`,
      );
      const execAfterUnchanged = afterUnchangedState.body.executions.find((e) => e.id === execution.id);
      assert.ok(execAfterUnchanged);
      assert.equal(execAfterUnchanged.status, "awaiting_human");
      assert.deepEqual(execAfterUnchanged.blocks[0].values.images, [
        "thumb_opt1.png",
        "thumb_opt2.png",
        "thumb_opt3.png",
      ]);
      assert.deepEqual(execAfterUnchanged.blocks[1].values.selected_values, [
        "thumb_opt1.png",
        "thumb_opt3.png",
      ]);
      assert.equal(execAfterUnchanged.blocks[2].attempt, 3);
      assert.deepEqual(execAfterUnchanged.methodSnapshot, execution.methodSnapshot);

      // 4. Edição do Método do canal via PUT /api/channels/:id/methods/:processType
      const editedBlocks = channel.methods.thumbnail.blocks.map((block) => ({
        ...block,
        name: `${block.name} (Revisado)`,
        instructions: "Instrução atualizada na edição do método",
      }));
      const editedMethodRes = await jsonRequest<Channel["methods"]["thumbnail"]>(
        `${baseUrl}/api/channels/${channel.id}/methods/thumbnail`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ processType: "thumbnail", blocks: editedBlocks }),
        },
      );
      assert.equal(editedMethodRes.response.status, 200, editedMethodRes.body.error);
      assert.equal(editedMethodRes.body.blocks[0].name, "Gerar thumbnail (Revisado)");

      // Comprova que a execução ativa mantém seu methodSnapshot original, entregas, seleções e tentativas
      const afterEditState = await jsonRequest<{ channels: Channel[]; executions: ProcessExecution[] }>(
        `${baseUrl}/api/state`,
      );
      const updatedChannel = afterEditState.body.channels.find((c) => c.id === channel.id);
      assert.ok(updatedChannel);
      assert.equal(
        updatedChannel.methods.thumbnail.blocks[0].name,
        "Gerar thumbnail (Revisado)",
        "Método do canal não foi atualizado",
      );

      const execAfterEdit = afterEditState.body.executions.find((e) => e.id === execution.id);
      assert.ok(execAfterEdit);
      assert.equal(execAfterEdit.status, "awaiting_human");
      assert.deepEqual(
        execAfterEdit.blocks[0].values.images,
        ["thumb_opt1.png", "thumb_opt2.png", "thumb_opt3.png"],
        "Entregas geradas foram perdidas após edição do Método",
      );
      assert.deepEqual(
        execAfterEdit.blocks[1].values.selected_values,
        ["thumb_opt1.png", "thumb_opt3.png"],
        "Decisões humanas de seleção foram perdidas após edição do Método",
      );
      assert.equal(
        execAfterEdit.blocks[2].attempt,
        3,
        "Identidade de tentativa reservada foi alterada",
      );
      assert.deepEqual(
        execAfterEdit.methodSnapshot,
        execution.methodSnapshot,
        "O snapshot da execução aberta não deve sofrer mutação pela alteração do canal",
      );

      // 5. Execução real de comando: completar bloco humano com seleção preservada
      const completeCommandId = crypto.randomUUID();
      const completeRes = await jsonRequest<{ result: unknown; state: { executions: ProcessExecution[] } }>(
        `${baseUrl}/api/commands`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: completeCommandId,
            action: "completeHuman",
            executionId: execution.id,
            blockId: "thumbnail-select",
            attempt: 2,
            values: { selected_values: ["thumb_opt1.png"] },
          }),
        },
      );
      assert.equal(completeRes.response.status, 200, completeRes.body.error);

      // 6. Execução real de comando: retry / rejeição no bloco anterior preserva entregas de blocos a montante
      // e renova identidade dos blocos a jusante já executados
      const retryCommandId = crypto.randomUUID();
      const retryRes = await jsonRequest<{ result: unknown; state: { executions: ProcessExecution[] } }>(
        `${baseUrl}/api/commands`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: retryCommandId,
            action: "retry",
            executionId: execution.id,
            blockId: "thumbnail-select",
            attempt: 2,
          }),
        },
      );
      assert.equal(retryRes.response.status, 200, retryRes.body.error);

      const finalState = await jsonRequest<{ executions: ProcessExecution[] }>(`${baseUrl}/api/state`);
      const finalExec = finalState.body.executions.find((e) => e.id === execution.id);
      assert.ok(finalExec);
      assert.deepEqual(
        finalExec.blocks[0].values.images,
        ["thumb_opt1.png", "thumb_opt2.png", "thumb_opt3.png"],
        "Entregas do primeiro bloco concluído devem ser preservadas após retry a jusante",
      );
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\nServer output:\n${serverLogs}`,
      );
    } finally {
      child.kill();
      if (child.exitCode === null) {
        await Promise.race([
          once(child, "exit"),
          new Promise((resolve) => setTimeout(resolve, 3_000)),
        ]);
      }
      rmSync(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  },
);

test("attemptAfterRetryInvalidation pure function: renova jobs executados e preserva pendentes sem execução", () => {
  assert.equal(
    attemptAfterRetryInvalidation({
      status: "completed",
      attempt: 2,
      completedAt: "2026-09-06T00:00:00.000Z",
    }),
    3,
  );
  assert.equal(
    attemptAfterRetryInvalidation({
      status: "failed",
      attempt: 4,
      jobId: "job-123",
    }),
    5,
  );
  assert.equal(
    attemptAfterRetryInvalidation({
      status: "pending",
      attempt: 3,
    }),
    3,
  );
});
