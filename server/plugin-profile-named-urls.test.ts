import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import {
  CONTENTFLOW_SCHEMA_MIGRATIONS,
  CONTENTFLOW_SCHEMA_VERSION,
  runSchemaMigrations,
} from "./schema-migrations";
import {
  PluginProfileNamedUrlStore,
  computePluginProfileNamedUrlsRevision,
  validateAndNormalizePluginProfileNamedUrl,
} from "./plugin-profile-named-urls";
import { validatePluginManifest } from "./plugin-validation";
import {
  BrowserProfileStore,
  PluginProfileBindingStore,
  PluginProfileReadinessStore,
} from "./browser-profiles";

const CONFIG = {
  allowedHosts: ["flow.example.com", "studio.example.org"],
  pathnamePattern: "^/p/.+$",
};

function baseManifest(namedUrls: unknown) {
  return {
    apiVersion: "2",
    id: "com.example.flow",
    name: "Flow",
    version: "1.0.0",
    description: "Desc",
    author: "Author",
    license: "MIT",
    runtime: { kind: "node", version: ">=26 <27", module: "esm" },
    entrypoint: "handler.mjs",
    permissions: [],
    profileSetup: {
      configurationKey: "profile",
      label: "Perfil",
      namedUrls,
    },
    capabilities: [
      {
        id: "cap",
        operator: "IA",
        blockTypes: ["CRIAR"],
        inputPorts: [],
        outputPorts: [
          {
            key: "out",
            label: "Out",
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            required: true,
          },
        ],
        execution: { mode: "immediate" },
        sideEffects: [],
        cost: { model: "free", estimateSupported: false },
        dataPolicy: { sendsDataToThirdParties: false },
        blockConfigSchema: { type: "object", properties: { profile: { type: "string" } } },
        outputSchema: { type: "object" },
      },
    ],
  };
}

async function migratedMemoryDatabase() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  const root = mkdtempSync(path.join(os.tmpdir(), "contentflow-named-urls-"));
  try {
    await runSchemaMigrations(database, undefined, { backupDirectory: path.join(root, "backups") });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  return database;
}

function seedBinding(database: Database.Database, pluginId: string, profileId: string) {
  const profiles = new BrowserProfileStore(database);
  const bindings = new PluginProfileBindingStore(database);
  if (!profiles.get(profileId)) {
    profiles.create({
      id: profileId,
      name: `Perfil ${profileId}`,
      alias:
        profileId
          .slice(0, 32)
          .replace(/[^a-z0-9-]/gi, "-")
          .toLowerCase() || "perfil",
      storageKind: "managed",
      storageKey: `browser-profiles/${profileId}`,
    });
  }
  if (!bindings.get(pluginId, profileId)) bindings.link(pluginId, profileId);
  return { profiles, bindings };
}

test("manifesto aceita namedUrls válido e rejeita declarações inválidas", () => {
  validatePluginManifest(baseManifest({ allowedHosts: ["flow.example.com"] }));
  validatePluginManifest(baseManifest(CONFIG));
  assert.throws(() => validatePluginManifest(baseManifest({ allowedHosts: [] })));
  assert.throws(() => validatePluginManifest(baseManifest({ allowedHosts: ["*.example.com"] })));
  assert.throws(() =>
    validatePluginManifest(
      baseManifest({ allowedHosts: ["Flow.Example.COM", "flow.example.com"] }),
    ),
  );
  assert.throws(() =>
    validatePluginManifest(
      baseManifest({ allowedHosts: Array.from({ length: 21 }, (_, i) => `h${i}.example.com`) }),
    ),
  );
  assert.throws(() =>
    validatePluginManifest(
      baseManifest({ allowedHosts: ["ok.example.com"], pathnamePattern: "/p/.+" }),
    ),
  );
  assert.throws(() =>
    validatePluginManifest(
      baseManifest({ allowedHosts: ["ok.example.com"], pathnamePattern: "^([a-z$" }),
    ),
  );
  assert.throws(() =>
    validatePluginManifest(
      baseManifest({ allowedHosts: ["ok.example.com"], pathnamePattern: `^${"a".repeat(500)}$` }),
    ),
  );
});

test("núcleo valida HTTPS, userinfo, host exato, path e tamanho", () => {
  const cfg = { allowedHosts: ["flow.example.com"] };
  assert.equal(
    validateAndNormalizePluginProfileNamedUrl("https://flow.example.com/p/1", {
      allowedHosts: ["flow.example.com"],
      pathnamePattern: "^/p/.+$",
    }),
    "https://flow.example.com/p/1",
  );
  assert.throws(() => validateAndNormalizePluginProfileNamedUrl("not-a-url", cfg), /inválida/);
  assert.throws(() =>
    validateAndNormalizePluginProfileNamedUrl("http://flow.example.com/p/1", cfg),
  );
  assert.throws(() =>
    validateAndNormalizePluginProfileNamedUrl("https://user:pass@flow.example.com/p/1", cfg),
  );
  assert.throws(() =>
    validateAndNormalizePluginProfileNamedUrl("https://sub.flow.example.com/p/1", cfg),
  );
  assert.throws(() =>
    validateAndNormalizePluginProfileNamedUrl("https://other.example.com/p/1", cfg),
  );
  assert.throws(() =>
    validateAndNormalizePluginProfileNamedUrl("https://flow.example.com/other", {
      allowedHosts: ["flow.example.com"],
      pathnamePattern: "^/p/.+$",
    }),
  );
  assert.throws(() =>
    validateAndNormalizePluginProfileNamedUrl(`https://flow.example.com/${"a".repeat(2048)}`, cfg),
  );
});

test("CRUD adiciona duas URLs, edita com ID estável e remove a linha correta", () => {
  return (async () => {
    const database = await migratedMemoryDatabase();
    try {
      seedBinding(database, "com.example.flow", "profile-1");
      const store = new PluginProfileNamedUrlStore(database);
      const empty = store.list("com.example.flow", "profile-1");
      const first = store.create(
        "com.example.flow",
        "profile-1",
        { name: "Projeto A", url: "https://flow.example.com/p/a" },
        empty.revision,
        CONFIG,
      );
      assert.equal(first.entries.length, 1);
      const second = store.create(
        "com.example.flow",
        "profile-1",
        { name: "  Projeto B  ", url: "https://studio.example.org/p/b" },
        first.revision,
        CONFIG,
      );
      assert.equal(second.entries.length, 2);
      assert.ok(second.entries.some((e) => e.name === "Projeto B"));
      assert.ok(second.entries.some((e) => e.name === "Projeto A"));
      const idA = second.entries.find((e) => e.name === "Projeto A")!.id;
      const idB = second.entries.find((e) => e.name === "Projeto B")!.id;
      assert.notEqual(idA, idB);

      const edited = store.update(
        "com.example.flow",
        "profile-1",
        idA,
        { name: "Projeto A renomeado" },
        second.revision,
        CONFIG,
      );
      assert.equal(edited.entries.find((e) => e.id === idA)!.name, "Projeto A renomeado");
      assert.equal(edited.entries.find((e) => e.id === idA)!.url, "https://flow.example.com/p/a");

      const removed = store.remove("com.example.flow", "profile-1", idB, edited.revision);
      assert.equal(removed.entries.length, 1);
      assert.equal(removed.entries[0]!.id, idA);
    } finally {
      database.close();
    }
  })();
});

test("URLs duplicadas canônicas são rejeitadas com 409 sem mutação", () => {
  return (async () => {
    const database = await migratedMemoryDatabase();
    try {
      seedBinding(database, "com.example.flow", "profile-1");
      const store = new PluginProfileNamedUrlStore(database);
      const empty = store.list("com.example.flow", "profile-1");
      const created = store.create(
        "com.example.flow",
        "profile-1",
        { name: "A", url: "https://flow.example.com/p/a" },
        empty.revision,
        CONFIG,
      );
      assert.throws(
        () =>
          store.create(
            "com.example.flow",
            "profile-1",
            { name: "A2", url: "https://flow.example.com/p/a" },
            created.revision,
            CONFIG,
          ),
        (error: unknown) => (error as { code?: string }).code === "DUPLICATE_URL",
      );
      assert.equal(store.list("com.example.flow", "profile-1").entries.length, 1);
    } finally {
      database.close();
    }
  })();
});

test("revisão obsoleta retorna 409 sem mutar dados; entrada estrangeira retorna 404", () => {
  return (async () => {
    const database = await migratedMemoryDatabase();
    try {
      seedBinding(database, "com.example.flow", "profile-1");
      seedBinding(database, "com.example.flow", "profile-2");
      const store = new PluginProfileNamedUrlStore(database);
      const empty = store.list("com.example.flow", "profile-1");
      const created = store.create(
        "com.example.flow",
        "profile-1",
        { name: "A", url: "https://flow.example.com/p/a" },
        empty.revision,
        CONFIG,
      );
      assert.throws(
        () =>
          store.create(
            "com.example.flow",
            "profile-1",
            { name: "B", url: "https://flow.example.com/p/b" },
            empty.revision,
            CONFIG,
          ),
        (error: unknown) => (error as { code?: string }).code === "STALE_REVISION",
      );
      assert.equal(store.list("com.example.flow", "profile-1").entries.length, 1);
      const foreignId = created.entries[0]!.id;
      assert.throws(
        () =>
          store.update(
            "com.example.flow",
            "profile-2",
            foreignId,
            { name: "X" },
            store.list("com.example.flow", "profile-2").revision,
            CONFIG,
          ),
        (error: unknown) => (error as { code?: string }).code === "FOREIGN_ENTRY",
      );
      assert.throws(
        () =>
          store.remove(
            "com.example.flow",
            "profile-2",
            foreignId,
            store.list("com.example.flow", "profile-2").revision,
          ),
        (error: unknown) => (error as { code?: string }).code === "FOREIGN_ENTRY",
      );
      assert.throws(
        () => store.remove("com.example.flow", "profile-1", "missing-id", created.revision),
        (error: unknown) => (error as { code?: string }).code === "NOT_FOUND",
      );
    } finally {
      database.close();
    }
  })();
});

test("perfis e plugins separados isolam entradas mesmo com perfil físico compartilhado", () => {
  return (async () => {
    const database = await migratedMemoryDatabase();
    try {
      seedBinding(database, "com.example.flow", "shared-profile");
      seedBinding(database, "com.example.other", "shared-profile");
      const store = new PluginProfileNamedUrlStore(database);
      const listA = store.list("com.example.flow", "shared-profile");
      const createdA = store.create(
        "com.example.flow",
        "shared-profile",
        { name: "A", url: "https://flow.example.com/p/a" },
        listA.revision,
        CONFIG,
      );
      assert.equal(createdA.entries.length, 1);
      assert.equal(store.list("com.example.other", "shared-profile").entries.length, 0);
      const listB = store.list("com.example.other", "shared-profile");
      const createdB = store.create(
        "com.example.other",
        "shared-profile",
        { name: "B", url: "https://flow.example.com/p/a" },
        listB.revision,
        CONFIG,
      );
      assert.equal(createdB.entries.length, 1);
      assert.notEqual(createdA.entries[0]!.id, createdB.entries[0]!.id);
    } finally {
      database.close();
    }
  })();
});

test("exclusão do vínculo remove somente suas entradas; CRUD não toca readiness/binding", () => {
  return (async () => {
    const database = await migratedMemoryDatabase();
    try {
      const { bindings } = seedBinding(database, "com.example.flow", "profile-1");
      seedBinding(database, "com.example.flow", "profile-2");
      const readiness = new PluginProfileReadinessStore(database);
      readiness.set({ pluginId: "com.example.flow", profileId: "profile-1", state: "ready" });
      const bindingBefore = bindings.get("com.example.flow", "profile-1")!;
      const readinessBefore = readiness.get("com.example.flow", "profile-1")!;
      const store = new PluginProfileNamedUrlStore(database);
      const empty = store.list("com.example.flow", "profile-1");
      const created = store.create(
        "com.example.flow",
        "profile-1",
        { name: "A", url: "https://flow.example.com/p/a" },
        empty.revision,
        CONFIG,
      );
      const other = store.list("com.example.flow", "profile-2");
      store.create(
        "com.example.flow",
        "profile-2",
        { name: "B", url: "https://flow.example.com/p/b" },
        other.revision,
        CONFIG,
      );
      assert.deepEqual(readiness.get("com.example.flow", "profile-1"), readinessBefore);
      assert.deepEqual(bindings.get("com.example.flow", "profile-1"), bindingBefore);
      bindings.unlink("com.example.flow", "profile-1");
      assert.equal(store.list("com.example.flow", "profile-1").entries.length, 0);
      assert.equal(created.entries.length, 1);
      assert.equal(store.list("com.example.flow", "profile-2").entries.length, 1);
    } finally {
      database.close();
    }
  })();
});

test("entradas persistem ao fechar e reabrir o banco", () => {
  return (async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "contentflow-named-urls-persist-"));
    const dbPath = path.join(root, "contentflow.sqlite");
    try {
      {
        const database = new Database(dbPath);
        database.pragma("foreign_keys = ON");
        await runSchemaMigrations(database, undefined, {
          backupDirectory: path.join(root, "backups"),
        });
        seedBinding(database, "com.example.flow", "profile-1");
        const store = new PluginProfileNamedUrlStore(database);
        const empty = store.list("com.example.flow", "profile-1");
        store.create(
          "com.example.flow",
          "profile-1",
          { name: "A", url: "https://flow.example.com/p/a" },
          empty.revision,
          CONFIG,
        );
        store.create(
          "com.example.flow",
          "profile-1",
          { name: "B", url: "https://studio.example.org/p/b" },
          store.list("com.example.flow", "profile-1").revision,
          CONFIG,
        );
        database.close();
      }
      {
        const database = new Database(dbPath);
        database.pragma("foreign_keys = ON");
        await runSchemaMigrations(database, undefined, {
          backupDirectory: path.join(root, "backups"),
        });
        const store = new PluginProfileNamedUrlStore(database);
        const reopened = store.list("com.example.flow", "profile-1");
        assert.equal(reopened.entries.length, 2);
        assert.equal(reopened.revision, computePluginProfileNamedUrlsRevision(reopened.entries));
        database.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  })();
});

test("migração v5 é aditiva e contígua até a versão declarada", () => {
  assert.equal(CONTENTFLOW_SCHEMA_MIGRATIONS.at(-1)?.version, CONTENTFLOW_SCHEMA_VERSION);
  assert.equal(CONTENTFLOW_SCHEMA_VERSION, 5);
  assert.deepEqual(
    CONTENTFLOW_SCHEMA_MIGRATIONS.map((m) => m.version),
    [1, 2, 3, 4, 5],
  );
});
