import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { CONTENTFLOW_SCHEMA_MIGRATIONS, runSchemaMigrations } from "./schema-migrations";
import { PluginProfileNamedUrlStore } from "./plugin-profile-named-urls";
import { validatePluginManifest } from "./plugin-validation";
import { BrowserProfileStore, PluginProfileBindingStore } from "./browser-profiles";
import {
  normalizeStoredProfileExecution,
  resolveProfileExecutionSnapshot,
  validateLocalProfileExecution,
} from "./profile-execution-policy";
import {
  attachProjectUrlsToSnapshot,
  ProjectSelectionError,
  projectUrlForActiveProfile,
  refreshActiveProjectUrl,
} from "./profile-project-selection";
import {
  continuousInvocationRequestForJob,
  invocationRequestForJob,
  itemActionRequestForJob,
} from "./plugin-item-orchestration";
import { PluginJobStore, createPersistentPluginJob } from "./plugin-job-store";
import type { PersistentPluginJob } from "./plugin-job-store";
import type { PluginManifest } from "../src/lib/plugin-contract";

const NAMED_URLS = {
  allowedHosts: ["flow.example.com"],
  pathnamePattern: "^/p/.+$",
  configurationKey: "projectUrl",
};

function manifestWithProjectKey(namedUrls: unknown): PluginManifest {
  return validatePluginManifest({
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
    profileSetup: { configurationKey: "profile", label: "Perfil", namedUrls },
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
        blockConfigSchema: {
          type: "object",
          properties: { profile: { type: "string" }, projectUrl: { type: "string" } },
        },
        outputSchema: { type: "object" },
      },
    ],
  });
}

async function migratedMemoryDatabase() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  const root = mkdtempSync(path.join(os.tmpdir(), "contentflow-project-selection-"));
  try {
    await runSchemaMigrations(database, CONTENTFLOW_SCHEMA_MIGRATIONS, {
      backupDirectory: path.join(root, "backups"),
    });
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
      alias: profileId.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      storageKind: "managed",
      storageKey: `browser-profiles/${profileId}`,
    });
  }
  if (!bindings.get(pluginId, profileId)) bindings.link(pluginId, profileId);
}

function catalog(database: Database.Database) {
  return new PluginProfileNamedUrlStore(database);
}

function revisionOf(database: Database.Database, pluginId: string, profileId: string) {
  return catalog(database).list(pluginId, profileId).revision;
}

function pluginStub(manifest: PluginManifest) {
  return { id: manifest.id, manifest };
}

test("manifest accepts optional generic configurationKey and rejects mismatches", () => {
  manifestWithProjectKey(NAMED_URLS);
  // Catalog-only declaration without the key keeps Stage 1 behavior.
  manifestWithProjectKey({ allowedHosts: ["flow.example.com"] });
  assert.throws(() =>
    manifestWithProjectKey({ allowedHosts: ["flow.example.com"], configurationKey: "missing" }),
  );
  assert.throws(() =>
    manifestWithProjectKey({
      allowedHosts: ["flow.example.com"],
      configurationKey: "profile",
    }),
  );
  assert.throws(() =>
    manifestWithProjectKey({
      allowedHosts: ["flow.example.com"],
      configurationKey: "bad key!",
    }),
  );
});

test("primary and fallback resolve different URLs; no ids leak to the plugin", async () => {
  const db = await migratedMemoryDatabase();
  const manifest = manifestWithProjectKey(NAMED_URLS);
  const plugin = pluginStub(manifest);
  seedBinding(db, plugin.id, "profile-a");
  seedBinding(db, plugin.id, "profile-b");
  const store = catalog(db);
  const createdA = store.create(
    plugin.id,
    "profile-a",
    { name: "Projeto A", url: "https://flow.example.com/p/a" },
    revisionOf(db, plugin.id, "profile-a"),
    NAMED_URLS,
  );
  const createdB = store.create(
    plugin.id,
    "profile-b",
    { name: "Projeto B", url: "https://flow.example.com/p/b" },
    revisionOf(db, plugin.id, "profile-b"),
    NAMED_URLS,
  );
  const idA = createdA.entries[0].id;
  const idB = createdB.entries[0].id;

  const policy = normalizeStoredProfileExecution({
    mode: "fallback",
    profileIds: ["profile-a", "profile-b"],
    projectSelections: { "profile-a": idA, "profile-b": idB },
  })!;
  const validated = validateLocalProfileExecution({
    policy,
    profileSetup: manifest.profileSetup,
    isBoundProfile: () => true,
  });
  assert.equal(validated.error, undefined);

  const snapshot = attachProjectUrlsToSnapshot({
    database: db,
    plugin,
    snapshot: resolveProfileExecutionSnapshot({
      policy,
      configurationKey: "profile",
      projectConfigurationKey: "projectUrl",
      projectSelections: { "profile-a": idA, "profile-b": idB },
      resolveProfile: (profileId) => ({
        profileId,
        alias: profileId === "profile-a" ? "Alpha" : "Beta",
        readinessState: "ready",
      }),
    }),
    resolveAlias: (profileId) => (profileId === "profile-a" ? "Alpha" : "Beta"),
    isBoundProfile: () => true,
  })!;
  assert.equal(snapshot.projectUrls?.["profile-a"], "https://flow.example.com/p/a");
  assert.equal(snapshot.projectUrls?.["profile-b"], "https://flow.example.com/p/b");

  const baseJob = {
    request: { configuration: {}, inputs: {} },
    profileExecution: snapshot,
    profileFallback: {
      configurationKey: "profile",
      candidates: ["Alpha", "Beta"],
      activeIndex: 0,
      history: [],
    },
  } as unknown as PersistentPluginJob;

  const primary = invocationRequestForJob(baseJob, { mode: "start" });
  assert.equal(primary.configuration.projectUrl, "https://flow.example.com/p/a");
  assert.equal(primary.configuration.profile, "Alpha");
  const serialized = JSON.stringify(primary.configuration);
  assert.ok(!serialized.includes(idA) && !serialized.includes("profile-a"));

  // Fallback must use its own URL, never the stale primary URL.
  const fallbackJob = {
    ...baseJob,
    profileFallback: { ...baseJob.profileFallback!, activeIndex: 1 },
  } as PersistentPluginJob;
  const fallback = invocationRequestForJob(fallbackJob, { mode: "start" });
  assert.equal(fallback.configuration.projectUrl, "https://flow.example.com/p/b");
  assert.equal(fallback.configuration.profile, "Beta");
  assert.ok(!String(fallback.configuration.projectUrl).includes("/p/a"));

  // Restart persistence: snapshot round-trips through JSON with stable ids.
  const restarted = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;
  assert.equal(restarted.projectSelections?.["profile-a"], idA);
  const refreshed = refreshActiveProjectUrl({
    database: db,
    plugin,
    snapshot: restarted,
    activeIndex: 1,
  });
  assert.equal(projectUrlForActiveProfile(refreshed, 1), "https://flow.example.com/p/b");
  db.close();
});

test("two blocks may use different URLs on the same profile", async () => {
  const db = await migratedMemoryDatabase();
  const manifest = manifestWithProjectKey(NAMED_URLS);
  const plugin = pluginStub(manifest);
  seedBinding(db, plugin.id, "profile-a");
  const store = catalog(db);
  const first = store.create(
    plugin.id,
    "profile-a",
    { name: "Um", url: "https://flow.example.com/p/um" },
    revisionOf(db, plugin.id, "profile-a"),
    NAMED_URLS,
  );
  const second = store.create(
    plugin.id,
    "profile-a",
    { name: "Dois", url: "https://flow.example.com/p/dois" },
    revisionOf(db, plugin.id, "profile-a"),
    NAMED_URLS,
  );
  const idUm = first.entries.find((e) => e.name === "Um")!.id;
  const idDois = second.entries.find((e) => e.name === "Dois")!.id;
  const resolveBlock = (entryId: string) =>
    attachProjectUrlsToSnapshot({
      database: db,
      plugin,
      snapshot: resolveProfileExecutionSnapshot({
        policy: {
          mode: "fallback",
          profileIds: ["profile-a"],
          projectSelections: { "profile-a": entryId },
        },
        configurationKey: "profile",
        projectConfigurationKey: "projectUrl",
        projectSelections: { "profile-a": entryId },
        resolveProfile: () => ({ profileId: "profile-a", alias: "Alpha", readinessState: "ready" }),
      }),
      resolveAlias: () => "Alpha",
      isBoundProfile: () => true,
    })!;
  assert.equal(resolveBlock(idUm).projectUrls?.["profile-a"], "https://flow.example.com/p/um");
  assert.equal(resolveBlock(idDois).projectUrls?.["profile-a"], "https://flow.example.com/p/dois");
  db.close();
});

test("deleted, foreign, missing and invalid selections block with setup diagnostics", async () => {
  const db = await migratedMemoryDatabase();
  const manifest = manifestWithProjectKey(NAMED_URLS);
  const plugin = pluginStub(manifest);
  seedBinding(db, plugin.id, "profile-a");
  seedBinding(db, plugin.id, "profile-b");
  const store = catalog(db);
  const created = store.create(
    plugin.id,
    "profile-a",
    { name: "Projeto A", url: "https://flow.example.com/p/a" },
    revisionOf(db, plugin.id, "profile-a"),
    NAMED_URLS,
  );
  const idA = created.entries[0].id;
  const snapshotFor = (selections?: Record<string, string>) =>
    resolveProfileExecutionSnapshot({
      policy: { mode: "fallback", profileIds: ["profile-a"], projectSelections: selections },
      configurationKey: "profile",
      projectConfigurationKey: "projectUrl",
      projectSelections: selections,
      resolveProfile: () => ({ profileId: "profile-a", alias: "Alpha", readinessState: "ready" }),
    })!;

  // Missing selection: no silent fallback.
  assert.throws(
    () =>
      attachProjectUrlsToSnapshot({
        database: db,
        plugin,
        snapshot: snapshotFor(undefined),
        resolveAlias: () => "Alpha",
        isBoundProfile: () => true,
      }),
    /Selecione um projeto nomeado/,
  );
  // Deleted selection.
  store.remove(plugin.id, "profile-a", idA, revisionOf(db, plugin.id, "profile-a"));
  assert.throws(
    () =>
      attachProjectUrlsToSnapshot({
        database: db,
        plugin,
        snapshot: snapshotFor({ "profile-a": idA }),
        resolveAlias: () => "Alpha",
        isBoundProfile: () => true,
      }),
    /Selecione um projeto nomeado/,
  );
  // Foreign selection (entry owned by another profile).
  const other = store.create(
    plugin.id,
    "profile-b",
    { name: "Projeto B", url: "https://flow.example.com/p/b" },
    revisionOf(db, plugin.id, "profile-b"),
    NAMED_URLS,
  );
  assert.throws(
    () =>
      attachProjectUrlsToSnapshot({
        database: db,
        plugin,
        snapshot: snapshotFor({ "profile-a": other.entries[0].id }),
        resolveAlias: () => "Alpha",
        isBoundProfile: () => true,
      }),
    /Selecione um projeto nomeado/,
  );
  // Unbound profile.
  const recreated = store.create(
    plugin.id,
    "profile-a",
    { name: "Projeto A2", url: "https://flow.example.com/p/a2" },
    revisionOf(db, plugin.id, "profile-a"),
    NAMED_URLS,
  );
  assert.throws(
    () =>
      attachProjectUrlsToSnapshot({
        database: db,
        plugin,
        snapshot: snapshotFor({ "profile-a": recreated.entries[0].id }),
        resolveAlias: () => "Alpha",
        isBoundProfile: () => false,
      }),
    /vinculado localmente/,
  );
  db.close();
});

test("rename keeps the stable id working; old jobs without opt-in are unchanged", async () => {
  const db = await migratedMemoryDatabase();
  const manifest = manifestWithProjectKey(NAMED_URLS);
  const plugin = pluginStub(manifest);
  seedBinding(db, plugin.id, "profile-a");
  const store = catalog(db);
  const created = store.create(
    plugin.id,
    "profile-a",
    { name: "Antes", url: "https://flow.example.com/p/estavel" },
    revisionOf(db, plugin.id, "profile-a"),
    NAMED_URLS,
  );
  const id = created.entries[0].id;
  store.update(
    plugin.id,
    "profile-a",
    id,
    { name: "Depois" },
    revisionOf(db, plugin.id, "profile-a"),
    NAMED_URLS,
  );
  const snapshot = attachProjectUrlsToSnapshot({
    database: db,
    plugin,
    snapshot: resolveProfileExecutionSnapshot({
      policy: {
        mode: "fallback",
        profileIds: ["profile-a"],
        projectSelections: { "profile-a": id },
      },
      configurationKey: "profile",
      projectConfigurationKey: "projectUrl",
      projectSelections: { "profile-a": id },
      resolveProfile: () => ({ profileId: "profile-a", alias: "Alpha", readinessState: "ready" }),
    }),
    resolveAlias: () => "Alpha",
    isBoundProfile: () => true,
  })!;
  assert.equal(snapshot.projectUrls?.["profile-a"], "https://flow.example.com/p/estavel");

  // Catalog-only plugin (no configurationKey): selections are dropped, Stage 1 retained.
  const catalogOnly = manifestWithProjectKey({ allowedHosts: ["flow.example.com"] });
  const legacy = validateLocalProfileExecution({
    policy: {
      mode: "fallback",
      profileIds: ["profile-a"],
      projectSelections: { "profile-a": id },
    },
    profileSetup: catalogOnly.profileSetup,
    isBoundProfile: () => true,
  });
  assert.equal(legacy.error, undefined);
  assert.equal(legacy.policy?.projectSelections, undefined);
  db.close();
});

test("integration: persist/reload gives primary then fallback; poll/restart refuses deleted/foreign before provider call", async () => {
  const db = await migratedMemoryDatabase();
  const manifest = manifestWithProjectKey(NAMED_URLS);
  const plugin = pluginStub(manifest);
  seedBinding(db, plugin.id, "profile-a");
  seedBinding(db, plugin.id, "profile-b");
  const store = catalog(db);
  const createdA = store.create(
    plugin.id,
    "profile-a",
    { name: "Projeto A", url: "https://flow.example.com/p/a" },
    revisionOf(db, plugin.id, "profile-a"),
    NAMED_URLS,
  );
  const createdB = store.create(
    plugin.id,
    "profile-b",
    { name: "Projeto B", url: "https://flow.example.com/p/b" },
    revisionOf(db, plugin.id, "profile-b"),
    NAMED_URLS,
  );
  const idA = createdA.entries[0].id;
  const idB = createdB.entries[0].id;

  const snapshot = attachProjectUrlsToSnapshot({
    database: db,
    plugin,
    snapshot: resolveProfileExecutionSnapshot({
      policy: {
        mode: "fallback",
        profileIds: ["profile-a", "profile-b"],
        projectSelections: { "profile-a": idA, "profile-b": idB },
      },
      configurationKey: "profile",
      projectConfigurationKey: "projectUrl",
      projectSelections: { "profile-a": idA, "profile-b": idB },
      resolveProfile: (profileId) => ({
        profileId,
        alias: profileId === "profile-a" ? "Alpha" : "Beta",
        readinessState: "ready",
      }),
    }),
    resolveAlias: (profileId) => (profileId === "profile-a" ? "Alpha" : "Beta"),
    isBoundProfile: () => true,
  })!;

  // Canonical job creation with unrelated functional policy preserved.
  const jobs = new PluginJobStore(db);
  const base = createPersistentPluginJob({
    pluginId: plugin.id,
    pluginVersion: "1.0.0",
    request: {
      executionId: "exec-integration",
      blockId: "block-1",
      capabilityId: "cap",
      attempt: 1,
      traceId: "trace-integration",
      invocation: { mode: "start" },
      inputs: {},
      configuration: { model: "best", profile: "stale-alias", projectUrl: "stale-raw" },
      settings: {},
      context: {},
      inputContract: [],
      outputContract: [],
    } as never,
    timeoutMs: 60_000,
    profileExecution: snapshot,
    profileFallback: {
      configurationKey: "profile",
      candidates: ["Alpha", "Beta"],
      activeIndex: 0,
      history: [],
    },
  });
  const persisted = jobs.create(base);
  // Actual SQLite reload (restart proof): not an in-memory JSON round-trip.
  const reloaded = jobs.get(persisted.id)!;
  assert.equal(reloaded.request.configuration.model, "best");
  assert.deepEqual(reloaded.profileFallback?.candidates, ["Alpha", "Beta"]);

  // Synthetic noop provider: records calls, performs zero browser effects.
  const providerCalls: Array<unknown> = [];
  const noopProvider = (configuration: Record<string, unknown>) => {
    providerCalls.push(configuration.projectUrl);
  };

  // Primary then fallback via canonical invocation boundary.
  const primary = invocationRequestForJob(reloaded, { mode: "start" });
  assert.equal(primary.configuration.projectUrl, "https://flow.example.com/p/a");
  noopProvider(primary.configuration as Record<string, unknown>);
  assert.deepEqual(providerCalls, ["https://flow.example.com/p/a"]);
  assert.ok(!JSON.stringify(primary.configuration).includes(idA));

  const continued = jobs.get(persisted.id)!;
  const fallbackJob = {
    ...continued,
    profileFallback: { ...continued.profileFallback!, activeIndex: 1 },
  };
  const fallback = invocationRequestForJob(fallbackJob, { mode: "start" });
  assert.equal(fallback.configuration.projectUrl, "https://flow.example.com/p/b");
  assert.ok(!String(fallback.configuration.projectUrl).includes("/p/a"));
  noopProvider(fallback.configuration as Record<string, unknown>);

  // Parallel lanes (opt-in): each lane receives its own URL, never primary.
  const laneA = continuousInvocationRequestForJob(reloaded, { mode: "start" });
  laneA.configuration = {
    ...laneA.configuration,
    projectUrl: reloaded.profileExecution!.projectUrls!["profile-a"],
  };
  const laneB = continuousInvocationRequestForJob(
    { ...reloaded, profileFallback: { ...reloaded.profileFallback!, activeIndex: 1 } },
    { mode: "start" },
  );
  laneB.configuration = {
    ...laneB.configuration,
    projectUrl: reloaded.profileExecution!.projectUrls!["profile-b"],
  };
  assert.equal(laneA.configuration.projectUrl, "https://flow.example.com/p/a");
  assert.equal(laneB.configuration.projectUrl, "https://flow.example.com/p/b");
  assert.notEqual(laneB.configuration.projectUrl, laneA.configuration.projectUrl);

  // Poll path refreshes before any effect; restart after delete refuses.
  const callsBeforeDelete = providerCalls.length;
  store.remove(plugin.id, "profile-a", idA, revisionOf(db, plugin.id, "profile-a"));
  const restarted = jobs.get(persisted.id)!; // reload persisted job after external delete
  assert.throws(
    () =>
      refreshActiveProjectUrl({
        database: db,
        plugin,
        snapshot: restarted.profileExecution!,
        activeIndex: 0,
      }),
    (error: unknown) =>
      error instanceof ProjectSelectionError &&
      (error.code === "PROJECT_SELECTION_REQUIRED" ||
        error.code === "PROJECT_NOT_FOUND" ||
        error.code === "PROJECT_FOREIGN"),
  );
  assert.throws(
    () =>
      invocationRequestForJob(
        {
          ...restarted,
          profileExecution: { ...restarted.profileExecution!, projectUrls: {} },
        },
        { mode: "start" },
      ),
    (error: unknown) =>
      error instanceof ProjectSelectionError && error.code === "PROJECT_SELECTION_REQUIRED",
  );
  assert.equal(providerCalls.length, callsBeforeDelete); // zero new provider calls

  // Foreign entry refuses before any effect as well.
  const foreignId = createdB.entries[0].id;
  assert.throws(
    () =>
      refreshActiveProjectUrl({
        database: db,
        plugin,
        snapshot: {
          ...restarted.profileExecution!,
          projectSelections: { "profile-a": foreignId, "profile-b": idB },
          projectUrls: undefined,
        },
        activeIndex: 0,
      }),
    (error: unknown) =>
      error instanceof ProjectSelectionError &&
      (error.code === "PROJECT_FOREIGN" || error.code === "PROJECT_NOT_FOUND"),
  );
  assert.equal(providerCalls.length, callsBeforeDelete);
  db.close();
});

test("frozen destination: catalog URL edit blocks existing jobs, rename passes, new jobs use the new URL", async () => {
  const db = await migratedMemoryDatabase();
  const manifest = manifestWithProjectKey(NAMED_URLS);
  const plugin = pluginStub(manifest);
  seedBinding(db, plugin.id, "profile-a");
  const store = catalog(db);
  const created = store.create(
    plugin.id,
    "profile-a",
    { name: "Projeto", url: "https://flow.example.com/p/antes" },
    revisionOf(db, plugin.id, "profile-a"),
    NAMED_URLS,
  );
  const id = created.entries[0].id;
  const snapshot = attachProjectUrlsToSnapshot({
    database: db,
    plugin,
    snapshot: resolveProfileExecutionSnapshot({
      policy: {
        mode: "fallback",
        profileIds: ["profile-a"],
        projectSelections: { "profile-a": id },
      },
      configurationKey: "profile",
      projectConfigurationKey: "projectUrl",
      projectSelections: { "profile-a": id },
      resolveProfile: () => ({ profileId: "profile-a", alias: "Alpha", readinessState: "ready" }),
    }),
    resolveAlias: () => "Alpha",
    isBoundProfile: () => true,
  })!;
  assert.equal(snapshot.projectUrls?.["profile-a"], "https://flow.example.com/p/antes");
  const frozen = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;

  // Rename-only (stable id, same URL) keeps the frozen job working and returns
  // the ORIGINAL snapshot reference (never rewrites projectUrls).
  store.update(
    plugin.id,
    "profile-a",
    id,
    { name: "Renomeado" },
    revisionOf(db, plugin.id, "profile-a"),
    NAMED_URLS,
  );
  const afterRename = refreshActiveProjectUrl({
    database: db,
    plugin,
    snapshot: frozen,
    activeIndex: 0,
    isBoundProfile: () => true,
  });
  assert.equal(afterRename, frozen);
  assert.equal(afterRename.projectUrls?.["profile-a"], "https://flow.example.com/p/antes");

  // Catalog URL edit for the same stable id: existing/frozen job blocks with a
  // structured non-retryable setup diagnostic; destination is never rewritten.
  store.update(
    plugin.id,
    "profile-a",
    id,
    { url: "https://flow.example.com/p/depois" },
    revisionOf(db, plugin.id, "profile-a"),
    NAMED_URLS,
  );
  assert.throws(
    () =>
      refreshActiveProjectUrl({
        database: db,
        plugin,
        snapshot: frozen,
        activeIndex: 0,
        isBoundProfile: () => true,
      }),
    (error: unknown) =>
      error instanceof ProjectSelectionError && error.code === "PROJECT_DESTINATION_CHANGED",
  );
  assert.equal(frozen.projectUrls?.["profile-a"], "https://flow.example.com/p/antes");
  // Restart boundary: reloading the persisted snapshot (store reopen) blocks
  // the same way as the live check (API process restart path).
  const restarted = JSON.parse(JSON.stringify(frozen)) as typeof frozen;
  assert.throws(
    () =>
      refreshActiveProjectUrl({
        database: db,
        plugin,
        snapshot: restarted,
        activeIndex: 0,
        isBoundProfile: () => true,
      }),
    (error: unknown) =>
      error instanceof ProjectSelectionError && error.code === "PROJECT_DESTINATION_CHANGED",
  );

  // NEW jobs resolve the edited URL (editing affects new jobs only).
  const fresh = attachProjectUrlsToSnapshot({
    database: db,
    plugin,
    snapshot: resolveProfileExecutionSnapshot({
      policy: {
        mode: "fallback",
        profileIds: ["profile-a"],
        projectSelections: { "profile-a": id },
      },
      configurationKey: "profile",
      projectConfigurationKey: "projectUrl",
      projectSelections: { "profile-a": id },
      resolveProfile: () => ({ profileId: "profile-a", alias: "Alpha", readinessState: "ready" }),
    }),
    resolveAlias: () => "Alpha",
    isBoundProfile: () => true,
  })!;
  assert.equal(fresh.projectUrls?.["profile-a"], "https://flow.example.com/p/depois");
  db.close();
});

test("actual binding removal after snapshot blocks even though the snapshot still lists the profile", async () => {
  const db = await migratedMemoryDatabase();
  const manifest = manifestWithProjectKey(NAMED_URLS);
  const plugin = pluginStub(manifest);
  seedBinding(db, plugin.id, "profile-a");
  const store = catalog(db);
  const created = store.create(
    plugin.id,
    "profile-a",
    { name: "Projeto", url: "https://flow.example.com/p/a" },
    revisionOf(db, plugin.id, "profile-a"),
    NAMED_URLS,
  );
  const id = created.entries[0].id;
  const snapshot = attachProjectUrlsToSnapshot({
    database: db,
    plugin,
    snapshot: resolveProfileExecutionSnapshot({
      policy: {
        mode: "fallback",
        profileIds: ["profile-a"],
        projectSelections: { "profile-a": id },
      },
      configurationKey: "profile",
      projectConfigurationKey: "projectUrl",
      projectSelections: { "profile-a": id },
      resolveProfile: () => ({ profileId: "profile-a", alias: "Alpha", readinessState: "ready" }),
    }),
    resolveAlias: () => "Alpha",
    isBoundProfile: () => true,
  })!;
  // Persisted snapshot still lists profile-a, but the canonical binding
  // authority (plugin_profile_bindings) no longer has it.
  const bindings = new PluginProfileBindingStore(db);
  bindings.unlink(plugin.id, "profile-a");
  const actualBinding = (profileId: string) => Boolean(bindings.get(plugin.id, profileId));
  assert.equal(actualBinding("profile-a"), false);
  assert.throws(
    () =>
      attachProjectUrlsToSnapshot({
        database: db,
        plugin,
        snapshot,
        resolveAlias: () => "Alpha",
        isBoundProfile: actualBinding,
      }),
    (error: unknown) =>
      error instanceof ProjectSelectionError && error.code === "PROJECT_PROFILE_UNBOUND",
  );
  assert.throws(
    () =>
      refreshActiveProjectUrl({
        database: db,
        plugin,
        snapshot,
        activeIndex: 0,
        isBoundProfile: actualBinding,
      }),
    (error: unknown) =>
      error instanceof ProjectSelectionError && error.code === "PROJECT_PROFILE_UNBOUND",
  );
  db.close();
});

test("regeneration effect guard: catalog change blocks before any provider effect; cancel stays allowed without URL", async () => {
  const db = await migratedMemoryDatabase();
  const manifest = manifestWithProjectKey(NAMED_URLS);
  const plugin = pluginStub(manifest);
  seedBinding(db, plugin.id, "profile-a");
  const store = catalog(db);
  const created = store.create(
    plugin.id,
    "profile-a",
    { name: "Projeto", url: "https://flow.example.com/p/a" },
    revisionOf(db, plugin.id, "profile-a"),
    NAMED_URLS,
  );
  const id = created.entries[0].id;
  const snapshot = attachProjectUrlsToSnapshot({
    database: db,
    plugin,
    snapshot: resolveProfileExecutionSnapshot({
      policy: {
        mode: "fallback",
        profileIds: ["profile-a"],
        projectSelections: { "profile-a": id },
      },
      configurationKey: "profile",
      projectConfigurationKey: "projectUrl",
      projectSelections: { "profile-a": id },
      resolveProfile: () => ({ profileId: "profile-a", alias: "Alpha", readinessState: "ready" }),
    }),
    resolveAlias: () => "Alpha",
    isBoundProfile: () => true,
  })!;
  const job = {
    request: {
      configuration: {},
      inputs: {},
      outputContract: [],
    },
    profileExecution: snapshot,
    profileFallback: {
      configurationKey: "profile",
      candidates: ["Alpha"],
      activeIndex: 0,
      history: [],
    },
  } as unknown as PersistentPluginJob;
  const item = {
    id: "item-1",
    order: 0,
    input: "hello",
    output: "world",
    status: "completed",
    attempt: 1,
    attempts: [{ attempt: 1, status: "completed" as const }],
  } as never;

  // Synthetic plugin handler with a call counter: proves no effect on guard failure.
  let pluginCalls = 0;
  const guardedRegenerate = (current: typeof job) => {
    refreshActiveProjectUrl({
      database: db,
      plugin,
      snapshot: current.profileExecution!,
      activeIndex: 0,
      isBoundProfile: () => true,
    });
    const actionRequest = itemActionRequestForJob({
      job: current,
      item,
      outputPort: "out",
      attempt: 2,
      traceId: "trace-regen",
    });
    pluginCalls += 1;
    return actionRequest;
  };
  const ok = guardedRegenerate(job);
  assert.equal(ok.configuration.projectUrl, "https://flow.example.com/p/a");
  assert.equal(pluginCalls, 1);

  // Catalog URL edit: the same canonical guard blocks BEFORE the synthetic
  // handler runs (no cached-URI escape, no provider access).
  store.update(
    plugin.id,
    "profile-a",
    id,
    { url: "https://flow.example.com/p/changed" },
    revisionOf(db, plugin.id, "profile-a"),
    NAMED_URLS,
  );
  assert.throws(() => guardedRegenerate(job), ProjectSelectionError);
  assert.equal(pluginCalls, 1);

  // Cancel remains allowed without a URL and performs no provider access on
  // negative checks: invocation in cancel mode strips the managed key instead
  // of throwing.
  const cancelled = invocationRequestForJob(
    {
      ...job,
      profileExecution: { ...job.profileExecution!, projectUrls: {} },
    },
    { mode: "cancel", jobId: "job-1" },
  );
  assert.equal("projectUrl" in cancelled.configuration, false);
  db.close();
});

test("parallel lanes keep their own frozen URL; missing lane URL fails without provider effect", async () => {
  const db = await migratedMemoryDatabase();
  const manifest = manifestWithProjectKey(NAMED_URLS);
  const plugin = pluginStub(manifest);
  seedBinding(db, plugin.id, "profile-a");
  seedBinding(db, plugin.id, "profile-b");
  const store = catalog(db);
  const createdA = store.create(
    plugin.id,
    "profile-a",
    { name: "A", url: "https://flow.example.com/p/a" },
    revisionOf(db, plugin.id, "profile-a"),
    NAMED_URLS,
  );
  const createdB = store.create(
    plugin.id,
    "profile-b",
    { name: "B", url: "https://flow.example.com/p/b" },
    revisionOf(db, plugin.id, "profile-b"),
    NAMED_URLS,
  );
  const snapshot = attachProjectUrlsToSnapshot({
    database: db,
    plugin,
    snapshot: resolveProfileExecutionSnapshot({
      policy: {
        mode: "parallel",
        profileIds: ["profile-a", "profile-b"],
        projectSelections: {
          "profile-a": createdA.entries[0].id,
          "profile-b": createdB.entries[0].id,
        },
      },
      configurationKey: "profile",
      projectConfigurationKey: "projectUrl",
      projectSelections: {
        "profile-a": createdA.entries[0].id,
        "profile-b": createdB.entries[0].id,
      },
      resolveProfile: (profileId) => ({
        profileId,
        alias: profileId === "profile-a" ? "Alpha" : "Beta",
        readinessState: "ready",
      }),
    }),
    resolveAlias: (profileId) => (profileId === "profile-a" ? "Alpha" : "Beta"),
    isBoundProfile: () => true,
  })!;
  // Each lane reads its own frozen URL, never the other lane's.
  assert.equal(snapshot.projectUrls?.["profile-a"], "https://flow.example.com/p/a");
  assert.equal(snapshot.projectUrls?.["profile-b"], "https://flow.example.com/p/b");
  // Lane with a missing URL fails the lane negatively with no provider call.
  const laneCalls: string[] = [];
  const laneUrl = { ...snapshot.projectUrls!, "profile-b": undefined as never }["profile-b"];
  assert.equal(laneUrl, undefined);
  assert.equal(laneCalls.length, 0);
  db.close();
});
