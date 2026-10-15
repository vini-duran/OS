import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

test("isolated API passes produced empty collections only to explicit optional plugin ports", async () => {
  const root = await mkdtemp(join(tmpdir(), "cf-empty-ports-"));
  const socket = createServer();
  await new Promise<void>((r) => socket.listen(0, "127.0.0.1", r));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((r) => socket.close(() => r()));
  const many = { kind: "content", family: "text", cardinality: "many", representation: "inline" };
  const one = { ...many, cardinality: "one" };
  const pluginId = "com.test.optional-empty-collections";
  const dir = join(root, "plugin");
  await mkdir(dir);
  const cap = (id: string, required: boolean) => ({
    id,
    operator: "Código",
    blockTypes: ["CRIAR"],
    processTypes: ["theme"],
    inputPorts: [{ key: "source", label: "source", required, shape: many }],
    outputPorts: [{ key: "result", label: "result", required: true, shape: one }],
    execution: { mode: "immediate", defaultTimeoutMs: 30000 },
    sideEffects: [],
    cost: { model: "free", estimateSupported: false },
    dataPolicy: { sendsDataToThirdParties: false },
    blockConfigSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: { result: { type: "string" } },
      required: ["result"],
      additionalProperties: false,
    },
  });
  await writeFile(
    join(dir, "contentflow.plugin.json"),
    JSON.stringify({
      apiVersion: "2",
      id: pluginId,
      name: "Synthetic empty ports",
      description: "Offline test fixture",
      version: "0.0.1",
      author: "Tests",
      license: "MIT",
      runtime: { kind: "node", version: ">=26 <27", module: "esm" },
      entrypoint: "handler.mjs",
      permissions: [],
      capabilities: [cap("optional", false), cap("required", true)],
    }),
  );
  await writeFile(
    join(dir, "handler.mjs"),
    `export async function execute(r) { if(!Array.isArray(r.inputs.source) || r.inputs.source.length) return {status:'error',code:'INVALID_INPUT',message:'Expected empty collection',retryable:false}; return {status:'success',values:{result:'empty collection received'}}; }`,
  );
  const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CONTENTFLOW_API_PORT: String(port),
      CONTENTFLOW_APP_ROOT: process.cwd(),
      CONTENTFLOW_DATA_DIR: join(root, "data"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  server.stdout.on("data", (c) => (logs = (logs + String(c)).slice(-12000)));
  server.stderr.on("data", (c) => (logs = (logs + String(c)).slice(-12000)));
  const api = async (
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
  ) => {
    const response = await fetch(`http://127.0.0.1:${port}` + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    assert(response.ok, `${response.status}: ${text}`);
    return text ? JSON.parse(text) : undefined;
  };
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        await api("/api/plugins");
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    assert(ready, logs);
    await api("/api/plugins/link-development-folder", { path: dir });
    await api(`/api/plugins/${pluginId}/consent`, { enabled: true }, "PUT");
    const now = new Date().toISOString();
    await api("/api/channels", {
      id: "channel",
      name: "Synthetic",
      language: "pt-BR",
      niche: "Test",
      createdAt: now,
    });
    const stages = Object.fromEntries(
      ["theme", "title", "thumbnail", "script", "narration", "assets", "editing", "publishing"].map(
        (k) => [k, k === "theme" ? "processing" : "not_started"],
      ),
    );
    for (const required of [false, true]) {
      const id = required ? "required" : "optional";
      await api("/api/projects", {
        id,
        channelId: "channel",
        title: id,
        currentStage: "theme",
        state: "processing",
        progress: 0,
        deadline: "",
        duration: "",
        createdAt: now,
        updatedAt: now,
        stages,
        assignee: { name: "Test", initials: "T" },
        thumbHue: 0,
      });
      const blocks = [
        {
          id: "source",
          type: "CRIAR",
          operator: "Humano",
          parameters: [],
          order: 0,
          outputs: [
            { id: "source-output", key: "results", label: "Results", shape: many, required: false },
          ],
        },
        {
          id: "target",
          type: "CRIAR",
          operator: "Código",
          parameters: [],
          order: 1,
          plugin: { pluginId, capabilityId: id, configuration: {} },
          inputs: [
            {
              id: "input",
              label: "Source",
              shape: many,
              portKey: "source",
              binding: { kind: "previous_block", blockId: "source", outputKey: "results" },
            },
          ],
          outputs: [
            {
              id: "target-output",
              key: "theme",
              portKey: "result",
              label: "Theme",
              shape: one,
              required: true,
            },
          ],
        },
      ];
      await api("/api/executions", {
        id,
        projectId: id,
        channelId: "channel",
        processType: "theme",
        methodSnapshot: { contractVersion: 3, name: "Synthetic", processType: "theme", blocks },
        blocks: [
          { blockId: "source", status: "completed", values: { results: [] }, attempt: 1 },
          { blockId: "target", status: "blocked_executor", values: {}, attempt: 1, startedAt: now },
        ],
        status: "blocked_executor",
        outputStatus: "pending",
        createdAt: now,
        updatedAt: now,
      });
      let state;
      for (let i = 0; i < 100; i++) {
        state = await api(`/api/executions/${id}/state`);
        if (
          required ||
          state.execution.blocks[1].status === "completed" ||
          state.execution.status === "failed"
        )
          break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (required) {
        assert.notEqual(state.execution.blocks[1].status, "completed");
        assert.equal(state.jobs.length, 0);
      } else {
        assert.equal(state.execution.blocks[1].status, "completed", JSON.stringify(state));
        assert.equal(state.execution.blocks[1].values.theme, "empty collection received");
      }
    }
  } finally {
    const exited = new Promise<void>((r) => server.once("exit", () => r()));
    server.kill("SIGTERM");
    await exited;
    await rm(root, { recursive: true, force: true });
  }
});
