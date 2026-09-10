import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const port = 8791;
const apiBase = `http://127.0.0.1:${port}`;
const repositoryRoot = process.cwd();

async function request(route: string, init?: RequestInit) {
  const response = await fetch(`${apiBase}${route}`, init);
  if (!response.ok) throw new Error(`${response.status} ${route}: ${await response.text()}`);
  return response.status === 204 ? undefined : response.json();
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await request("/api/plugins");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("A API isolada não iniciou no prazo.");
}

for (const failure of [
  { code: "UPSTREAM_UNAVAILABLE", retryable: true, advances: true },
  { code: "RATE_LIMIT", retryable: true, advances: false },
  { code: "TIMEOUT", retryable: false, advances: false },
])
  test(`preserva itens concluídos; fallback ${failure.code}, retryable=${failure.retryable}`, async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "contentflow-profile-fallback-"));
    const pluginDirectory = path.join(dataDirectory, "test-browser-plugin");
    await mkdir(pluginDirectory, { recursive: true });
    await writeFile(
      path.join(pluginDirectory, "contentflow.plugin.json"),
      JSON.stringify({
        apiVersion: "1",
        id: "test.contentflow.browser-fallback",
        name: "Browser fallback test",
        version: "1.0.0",
        description: "Fixture isolada para fallback técnico.",
        author: "ContentFlow tests",
        license: "MIT",
        runtime: { kind: "node", version: ">=26 <27", module: "esm" },
        entrypoint: "handler.mjs",
        permissions: [],
        supportsConversationContinuation: true,
        profileSetup: {
          configurationKey: "accountProfile",
          fallbackConfigurationKey: "fallbackAccountProfiles",
          label: "Salvar perfil",
        },
        capabilities: [
          {
            id: "sequential-items",
            operator: "Código",
            blockTypes: ["CRIAR"],
            processTypes: ["theme"],
            inputPorts: [
              {
                key: "prompts",
                label: "Prompts",
                acceptedTypes: ["list", "text"],
                required: true,
                multiple: true,
              },
            ],
            outputPorts: [
              { key: "results", label: "Resultados", producedTypes: ["list"], required: true },
              {
                key: "combined",
                label: "Resultado unido",
                producedTypes: ["textarea"],
                required: false,
              },
            ],
            execution: {
              mode: "immediate",
              maxConcurrency: 1,
              itemOrchestration: {
                inputPort: "prompts",
                outputPort: "results",
                combinedOutputPort: "combined",
                mode: "sequential",
              },
            },
            sideEffects: [],
            cost: { model: "free", estimateSupported: false },
            dataPolicy: { sendsDataToThirdParties: false },
            blockConfigSchema: {
              type: "object",
              additionalProperties: false,
              properties: {
                accountProfile: { type: "string", default: "primary" },
                fallbackAccountProfiles: { type: "string", default: "" },
              },
            },
            outputSchema: {
              type: "object",
              additionalProperties: false,
              properties: { results: { type: "array" }, combined: { type: "string" } },
              required: ["results"],
            },
          },
        ],
      }),
    );
    await writeFile(
      path.join(pluginDirectory, "handler.mjs"),
      `export async function execute(request) {
      if (request.invocation.mode === "configure") return { status: "success", values: { ready: true } };
      const profile = request.configuration.accountProfile;
      const prompt = request.inputs.prompts;
      if (profile === "primary" && prompt === "two") {
        return { status: "error", code: ${JSON.stringify(failure.code)}, message: "temporary", retryable: ${failure.retryable} };
      }
      const mode = request.conversation?.mode ?? "none";
      if (profile === "backup" && prompt === "two" && !request.conversation?.fallbackContext?.includes("primary:new:one")) {
        return { status: "error", code: "INVALID_INPUT", message: "missing fallback context", retryable: false };
      }
      const value = profile + ":" + mode + ":" + prompt;
      return {
        status: "success",
        values: { results: [value], combined: value },
        conversation: { id: "https://provider.test/chat/" + profile },
      };
    }`,
    );

    const output: string[] = [];
    const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        CONTENTFLOW_API_PORT: String(port),
        CONTENTFLOW_APP_ROOT: repositoryRoot,
        CONTENTFLOW_DATA_DIR: dataDirectory,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    server.stdout.on("data", (chunk) => output.push(String(chunk)));
    server.stderr.on("data", (chunk) => output.push(String(chunk)));

    try {
      await waitForServer();
      await request("/api/plugins/link-development-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pluginDirectory }),
      });
      await request("/api/plugins/test.contentflow.browser-fallback/consent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });

      const now = new Date().toISOString();
      await request("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "fallback-channel",
          name: "Fallback",
          language: "pt-BR",
          niche: "Teste",
          createdAt: now,
        }),
      });
      await request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "fallback-project",
          title: "Fallback",
          channelId: "fallback-channel",
          currentStage: "theme",
          state: "processing",
          progress: 0,
          deadline: "Sem prazo",
          duration: "—",
          updatedAt: "Agora",
          createdAt: now,
          stages: Object.fromEntries(
            [
              "theme",
              "title",
              "thumbnail",
              "script",
              "narration",
              "assets",
              "editing",
              "publishing",
            ].map((processType) => [
              processType,
              processType === "theme" ? "processing" : "not_started",
            ]),
          ),
          assignee: { name: "Teste", initials: "T" },
          thumbHue: 0,
        }),
      });
      const block = {
        id: "fallback-block",
        type: "CRIAR",
        operator: "Código",
        name: "Itens",
        inputs: [
          {
            id: "prompts",
            label: "Prompts",
            type: "list",
            source: "static",
            staticValue: ["one", "two", "three"],
          },
        ],
        outputs: [
          { id: "results", label: "Resultados", key: "results", type: "list", required: true },
          {
            id: "combined",
            label: "Resultado unido",
            key: "combined",
            type: "textarea",
            required: true,
          },
        ],
        plugin: {
          pluginId: "test.contentflow.browser-fallback",
          capabilityId: "sequential-items",
          configuration: {
            accountProfile: "primary",
            fallbackAccountProfiles: "backup",
          },
        },
        parameters: [],
        order: 0,
      };
      await request("/api/executions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "fallback-execution",
          projectId: "fallback-project",
          channelId: "fallback-channel",
          processType: "theme",
          methodSnapshot: { processType: "theme", blocks: [block] },
          blocks: [
            {
              blockId: "fallback-block",
              status: "blocked_executor",
              values: {},
              attempt: 1,
              startedAt: now,
            },
          ],
          status: "blocked_executor",
          outputStatus: "pending",
          createdAt: now,
          updatedAt: now,
        }),
      });

      let execution:
        | { status: string; blocks: Array<{ status: string; values: Record<string, unknown> }> }
        | undefined;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        execution = (
          (await request("/api/executions/fallback-execution/state")) as {
            execution: typeof execution;
          }
        ).execution;
        if (execution?.blocks[0]?.status === "completed" || execution?.status === "failed") break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!failure.advances) {
        assert.equal(execution?.status, "failed", output.join("\n"));
        const state = await request("/api/executions/fallback-execution/state");
        assert.equal(state.jobs.length, 1);
        assert.deepEqual(state.jobs[0].partialValues.results, ["primary:new:one"]);
        return;
      }
      assert.equal(execution?.blocks[0]?.status, "completed", output.join("\n"));
      assert.deepEqual(execution?.blocks[0]?.values.results, [
        "primary:new:one",
        "backup:new:two",
        "backup:reuse:three",
      ]);
      assert.equal(
        execution?.blocks[0]?.values.combined,
        "primary:new:one\n\nbackup:new:two\n\nbackup:reuse:three",
      );
    } finally {
      if (server.exitCode === null) {
        server.kill();
        await new Promise((resolve) => server.once("exit", resolve));
      }
      await rm(dataDirectory, { recursive: true, force: true });
    }
  });
