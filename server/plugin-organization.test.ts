import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import Database from "better-sqlite3";

import {
  readPluginOrganization,
  registerPluginOrganizationRoutes,
  writePluginOrganization,
} from "./plugin-organization";
import {
  PLUGIN_ORGANIZATION_NONE_SECTION_ID,
  movePluginToSection,
  pluginOrganizationRevision,
} from "../src/lib/plugin-organization";

const APP_PREFERENCES_SCHEMA = `
  CREATE TABLE app_preferences (
    id TEXT PRIMARY KEY,
    theme TEXT NOT NULL,
    language TEXT NOT NULL,
    notification_sound INTEGER NOT NULL DEFAULT 0,
    system_notifications INTEGER NOT NULL DEFAULT 0,
    methods_library_view TEXT NOT NULL DEFAULT 'channels',
    updated_at TEXT NOT NULL
  );
`;

function freshDatabase() {
  const database = new Database(":memory:");
  database.exec(APP_PREFERENCES_SCHEMA);
  return database;
}

function legacyDatabase() {
  // Base antiga: sem a coluna plugin_organization e com preferências do usuário.
  const database = freshDatabase();
  database
    .prepare(
      `INSERT INTO app_preferences
         (id, theme, language, notification_sound, system_notifications, methods_library_view, updated_at)
       VALUES ('global', 'light', 'es', 1, 1, 'methods', '2026-01-01T00:00:00.000Z')`,
    )
    .run();
  return database;
}

function columnNames(database: Database.Database) {
  return (
    database.prepare("PRAGMA table_info(app_preferences)").all() as Array<{ name: string }>
  ).map((column) => column.name);
}

test("fresh: GET não grava e devolve organização padrão", () => {
  const database = freshDatabase();
  const first = readPluginOrganization(database);
  assert.equal(first.organization.sections.length, 5);
  assert.deepEqual(readPluginOrganization(database), first);
  // Nenhuma linha foi criada pelo GET.
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS total FROM app_preferences").get() as { total: number })
      .total,
    0,
  );
  // Única migração aditiva: a coluna passa a existir.
  assert.ok(columnNames(database).includes("plugin_organization"));
  database.close();
});

test("base antiga: coluna é criada sem tocar nas preferências", () => {
  const database = legacyDatabase();
  const state = readPluginOrganization(database);
  assert.ok(columnNames(database).includes("plugin_organization"));
  assert.deepEqual(state.organization, readPluginOrganization(database).organization);
  const row = database
    .prepare(
      "SELECT theme, language, methods_library_view FROM app_preferences WHERE id = 'global'",
    )
    .get() as { theme: string; language: string; methods_library_view: string };
  assert.deepEqual(row, { theme: "light", language: "es", methods_library_view: "methods" });
  database.close();
});

test("organização sobrevive a reabrir o DB e preserva app prefs", () => {
  const database = legacyDatabase();
  const current = readPluginOrganization(database);
  const next = movePluginToSection(current.organization, "plugin-a", "editing");
  const written = writePluginOrganization(database, {
    organization: next,
    revision: current.revision,
  });
  assert.equal(written.organization.items["plugin-a"].section, "editing");
  assert.notEqual(written.revision, current.revision);
  // Releitura confirma persistência; prefs do usuário intactas.
  const reopened = readPluginOrganization(database);
  assert.deepEqual(reopened, written);
  const row = database
    .prepare("SELECT theme, language FROM app_preferences WHERE id = 'global'")
    .get() as { theme: string; language: string };
  assert.deepEqual(row, { theme: "light", language: "es" });
  database.close();
});

test("PUT sem linha global cria padrões sem sobrescrever depois", () => {
  const database = freshDatabase();
  const current = readPluginOrganization(database);
  const written = writePluginOrganization(database, {
    organization: movePluginToSection(current.organization, "plugin-a", "generation"),
    revision: current.revision,
  });
  const row = database.prepare("SELECT * FROM app_preferences WHERE id = 'global'").get() as Record<
    string,
    unknown
  >;
  assert.equal(row.theme, "dark");
  assert.equal(row.language, "pt-BR");
  // Segundo PUT preserva um theme alterado por outro fluxo.
  database.prepare("UPDATE app_preferences SET theme = 'light' WHERE id = 'global'").run();
  const second = writePluginOrganization(database, {
    organization: written.organization,
    revision: written.revision,
  });
  const after = database.prepare("SELECT theme FROM app_preferences WHERE id = 'global'").get() as {
    theme: string;
  };
  assert.equal(after.theme, "light");
  assert.equal(second.revision, pluginOrganizationRevision(written.organization));
  database.close();
});

test("revisão obsoleta retorna 409 com estado atual; input inválido retorna 400", async () => {
  const database = freshDatabase();
  const app = express();
  app.use(express.json());
  registerPluginOrganizationRoutes(app, database);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const initial = (await (await fetch(`${baseUrl}/api/plugins/organization`)).json()) as {
      organization: unknown;
      revision: string;
    };
    assert.ok(initial.revision);

    // PUT válido via Express.
    const moved = movePluginToSection(
      readPluginOrganization(database).organization,
      "plugin-a",
      "publishing",
    );
    const putResponse = await fetch(`${baseUrl}/api/plugins/organization`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization: moved, revision: initial.revision }),
    });
    assert.equal(putResponse.status, 200);

    // Revisão obsoleta: 409 com organização atual para recarregar.
    const staleResponse = await fetch(`${baseUrl}/api/plugins/organization`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization: moved, revision: initial.revision }),
    });
    assert.equal(staleResponse.status, 409);
    const staleBody = (await staleResponse.json()) as {
      organization: { items: Record<string, { section: string }> };
      revision: string;
    };
    assert.equal(staleBody.organization.items["plugin-a"].section, "publishing");
    assert.ok(staleBody.revision);

    // Inputs inválidos: 400 sem mudar nada.
    for (const invalid of [
      {},
      { organization: moved },
      { revision: initial.revision },
      { organization: { items: [] }, revision: staleBody.revision },
      { organization: moved, revision: staleBody.revision + "-tampered" },
    ]) {
      const response = await fetch(`${baseUrl}/api/plugins/organization`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invalid),
      });
      // Revisão adulterada é conflito; demais são input inválido.
      assert.ok(response.status === 400 || response.status === 409);
    }
    const badSection = structuredClone(moved) as {
      items: Record<string, { section: string }>;
    };
    badSection.items["plugin-b"] = { section: "inexistente" } as never;
    const invalidResponse = await fetch(`${baseUrl}/api/plugins/organization`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization: badSection, revision: staleBody.revision }),
    });
    assert.equal(invalidResponse.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    database.close();
  }
});

test("leitura de JSON corrompido não grava nem quebra", () => {
  const database = freshDatabase();
  readPluginOrganization(database);
  database
    .prepare(
      `INSERT INTO app_preferences
         (id, theme, language, notification_sound, system_notifications, methods_library_view, plugin_organization, updated_at)
       VALUES ('global', 'dark', 'pt-BR', 0, 0, 'channels', 'não-json', '2026-01-01T00:00:00.000Z')`,
    )
    .run();
  const state = readPluginOrganization(database);
  assert.deepEqual(Object.keys(state.organization.items), []);
  const row = database
    .prepare("SELECT plugin_organization FROM app_preferences WHERE id = 'global'")
    .get() as { plugin_organization: string };
  assert.equal(row.plugin_organization, "não-json");
  assert.ok(state.organization.sectionOrder[PLUGIN_ORGANIZATION_NONE_SECTION_ID]);
  database.close();
});
