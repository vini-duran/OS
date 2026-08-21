import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const port = 8793;
const apiBase = `http://127.0.0.1:${port}`;
const repositoryRoot = process.cwd();
const pluginId = "com.contentflow.kit-text-demo";

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

test("preserva ativação em atualização compatível de pasta ao vivo", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "contentflow-plugin-consent-"));
  const dataDirectory = path.join(root, "data");
  const pluginDirectory = path.join(root, "plugin");
  const sourceDirectory = path.join(repositoryRoot, "plugins", "examples", "kit-generated-text-transform");
  await cp(sourceDirectory, pluginDirectory, { recursive: true });
  const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      CONTENTFLOW_API_PORT: String(port),
      CONTENTFLOW_APP_ROOT: repositoryRoot,
      CONTENTFLOW_DATA_DIR: dataDirectory,
    },
    stdio: "ignore",
    windowsHide: true,
  });

  try {
    await waitForServer();
    await request("/api/plugins/link-development-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pluginDirectory }),
    });
    await request(`/api/plugins/${pluginId}/consent`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });

    const manifestPath = path.join(pluginDirectory, "contentflow.plugin.json");
    const compatible = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    compatible.version = "0.1.1";
    await writeFile(manifestPath, JSON.stringify(compatible, null, 2), "utf8");
    const compatiblePlugins = (await request("/api/plugins")) as { plugins: Array<{ id: string; enabled: boolean }> };
    assert.equal(compatiblePlugins.plugins.find((plugin) => plugin.id === pluginId)?.enabled, true);

    compatible.permissions = ["network"];
    compatible.networkHosts = ["example.com"];
    const capabilities = compatible.capabilities as Array<Record<string, unknown>>;
    capabilities[0].dataPolicy = { sendsDataToThirdParties: true, providers: ["Example API"] };
    await writeFile(manifestPath, JSON.stringify(compatible, null, 2), "utf8");
    const expandedPlugins = (await request("/api/plugins")) as { plugins: Array<{ id: string; enabled: boolean }> };
    assert.equal(expandedPlugins.plugins.find((plugin) => plugin.id === pluginId)?.enabled, false);
  } finally {
    server.kill();
    await rm(root, { recursive: true, force: true });
  }
});
