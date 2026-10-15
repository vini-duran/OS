import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import express from "express";
import { runSchemaMigrations } from "./schema-migrations";
import { registerPluginProfileNamedUrlRoutes } from "./plugin-profile-named-urls";
import { BrowserProfileStore, PluginProfileBindingStore } from "./browser-profiles";

const CONFIG = { allowedHosts: ["flow.example.com"], pathnamePattern: "^/p/.+$" };

async function fixture(optIn: boolean) {
  const root = mkdtempSync(path.join(os.tmpdir(), "contentflow-named-urls-http-"));
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  await runSchemaMigrations(database, undefined, { backupDirectory: path.join(root, "backups") });
  const profiles = new BrowserProfileStore(database);
  const bindings = new PluginProfileBindingStore(database);
  profiles.create({
    id: "profile-1",
    name: "Principal",
    alias: "principal",
    storageKind: "managed",
    storageKey: "browser-profiles/profile-1",
  });
  bindings.link("com.example.flow", "profile-1");
  const app = express();
  app.use(express.json());
  registerPluginProfileNamedUrlRoutes(app, {
    database,
    resolveProfilePlugin: (pluginId) => {
      if (pluginId !== "com.example.flow") return undefined;
      if (!optIn) return { id: pluginId, manifest: { profileSetup: {} } };
      return { id: pluginId, manifest: { profileSetup: { namedUrls: CONFIG } } };
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { root, database, server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function close(f: Awaited<ReturnType<typeof fixture>>) {
  await new Promise<void>((resolve) => f.server.close(() => resolve()));
  f.database.close();
  rmSync(f.root, { recursive: true, force: true });
}

test("HTTP nega plugin sem opt-in, vínculo ausente e IDs estrangeiros", async () => {
  const f = await fixture(true);
  try {
    const unbound = await fetch(
      `${f.baseUrl}/api/plugins/com.example.flow/profile-bindings/missing/named-urls`,
    );
    assert.equal(unbound.status, 404);
    assert.equal(((await unbound.json()) as { code?: string }).code, "NOT_BOUND");

    const unknownPlugin = await fetch(
      `${f.baseUrl}/api/plugins/com.unknown/profile-bindings/profile-1/named-urls`,
    );
    assert.equal(unknownPlugin.status, 404);

    const created = (await (
      await fetch(
        `${f.baseUrl}/api/plugins/com.example.flow/profile-bindings/profile-1/named-urls`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "A",
            url: "https://flow.example.com/p/a",
            revision: (
              (await (
                await fetch(
                  `${f.baseUrl}/api/plugins/com.example.flow/profile-bindings/profile-1/named-urls`,
                )
              ).json()) as { revision: string }
            ).revision,
          }),
        },
      )
    ).json()) as { entries: Array<{ id: string }>; revision: string };
    const foreign = await fetch(
      `${f.baseUrl}/api/plugins/com.example.flow/profile-bindings/missing/named-urls/${created.entries[0]!.id}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: created.revision }),
      },
    );
    assert.equal(foreign.status, 404);
  } finally {
    await close(f);
  }
});

test("HTTP sem opt-in retorna 404 NOT_ENABLED", async () => {
  const f = await fixture(false);
  try {
    const response = await fetch(
      `${f.baseUrl}/api/plugins/com.example.flow/profile-bindings/profile-1/named-urls`,
    );
    assert.equal(response.status, 404);
    assert.equal(((await response.json()) as { code?: string }).code, "NOT_ENABLED");
  } finally {
    await close(f);
  }
});

test("HTTP CRUD valida revisão, URLs e ignora chaves extras/ID enviado", async () => {
  const f = await fixture(true);
  try {
    const base = `${f.baseUrl}/api/plugins/com.example.flow/profile-bindings/profile-1/named-urls`;
    const initial = (await (await fetch(base)).json()) as { entries: unknown[]; revision: string };
    assert.deepEqual(initial.entries, []);
    assert.ok(initial.revision);

    // POST sem revision -> 409
    const missingRev = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "A", url: "https://flow.example.com/p/a" }),
    });
    assert.equal(missingRev.status, 409);

    // URL inválidas -> 400 com código estruturado
    for (const url of [
      "http://flow.example.com/p/a",
      "https://user@flow.example.com/p/a",
      "https://other.example.com/p/a",
      "https://flow.example.com/other",
      "not-a-url",
    ]) {
      const bad = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "A", url, revision: initial.revision }),
      });
      assert.equal(bad.status, 400, url);
      assert.ok(((await bad.json()) as { code?: string }).code);
    }

    // Criação válida ignora id enviado e chaves extras
    const createdRes = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "A",
        url: "https://flow.example.com/p/a",
        revision: initial.revision,
        id: "forged",
        extra: 1,
      }),
    });
    assert.equal(createdRes.status, 201);
    const created = (await createdRes.json()) as {
      entries: Array<{ id: string; name: string; url: string }>;
      revision: string;
    };
    assert.equal(created.entries.length, 1);
    assert.notEqual(created.entries[0]!.id, "forged");

    // Duplicada -> 409
    const dup = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "A2",
        url: "https://flow.example.com/p/a",
        revision: created.revision,
      }),
    });
    assert.equal(dup.status, 409);

    // Stale -> 409 sem mutação
    const stale = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "B",
        url: "https://flow.example.com/p/b",
        revision: initial.revision,
      }),
    });
    assert.equal(stale.status, 409);
    assert.equal(((await (await fetch(base)).json()) as { entries: unknown[] }).entries.length, 1);

    // PATCH troca nome preservando ID
    const id = created.entries[0]!.id;
    const patchedRes = await fetch(`${base}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "A renomeado", revision: created.revision }),
    });
    assert.equal(patchedRes.status, 200);
    const patched = (await patchedRes.json()) as {
      entries: Array<{ id: string; name: string }>;
      revision: string;
    };
    assert.equal(patched.entries[0]!.id, id);
    assert.equal(patched.entries[0]!.name, "A renomeado");

    // DELETE desconhecido -> 404
    const missing = await fetch(`${base}/${encodeURIComponent("missing")}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: patched.revision }),
    });
    assert.equal(missing.status, 404);

    // DELETE válido
    const deletedRes = await fetch(`${base}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: patched.revision }),
    });
    assert.equal(deletedRes.status, 200);
    assert.deepEqual(((await deletedRes.json()) as { entries: unknown[] }).entries, []);
  } finally {
    await close(f);
  }
});
