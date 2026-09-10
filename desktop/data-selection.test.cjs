/**
 * Seleção determinística do diretório de dados — suíte isolada.
 *
 * Cada teste usa um diretório sintético INDEPENDENTE em os.tmpdir().
 * Nenhum cofre, banco real ou HOME do operador é acessado: `appDataDir` é
 * sempre explícito e `env` nunca herda process.env.
 *
 * Node exigido pelo projeto: >=26 <27 (engines em package.json).
 */

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { resolveDataLocation, CONFIG_FILENAME } = require("./data-selection.cjs");

function makeAppData() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "contentflow-data-selection-"));
  const appData = path.join(root, "Application Support");
  fs.mkdirSync(appData, { recursive: true });
  return { root, appData };
}

function makeDb(appData, appName) {
  const dataDir = path.join(appData, appName, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "contentflow.sqlite"), "-- synthetic db --");
  return dataDir;
}

function readPrimaryConfig(appData) {
  return JSON.parse(
    fs.readFileSync(path.join(appData, "ContentFlow", CONFIG_FILENAME), "utf8"),
  );
}

test("env explícito tem precedência e não grava config", () => {
  const { root, appData } = makeAppData();
  try {
    const custom = path.join(root, "custom-data");
    fs.mkdirSync(custom, { recursive: true });
    const result = resolveDataLocation({
      appDataDir: appData,
      env: { CONTENTFLOW_DESKTOP_DATA_DIR: custom },
    });
    assert.equal(result.source, "env_explicit");
    assert.equal(result.dataDir, path.resolve(custom));
    assert.equal(result.userData, path.resolve(path.dirname(custom)));
    assert.equal(
      fs.existsSync(path.join(appData, "ContentFlow", CONFIG_FILENAME)),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("env explícito com userData próprio é respeitado", () => {
  const { root, appData } = makeAppData();
  try {
    const data = path.join(root, "data");
    const user = path.join(root, "user");
    fs.mkdirSync(data, { recursive: true });
    fs.mkdirSync(user, { recursive: true });
    const result = resolveDataLocation({
      appDataDir: appData,
      env: { CONTENTFLOW_DESKTOP_DATA_DIR: data, CONTENTFLOW_ELECTRON_USER_DATA_DIR: user },
    });
    assert.equal(result.source, "env_explicit");
    assert.equal(result.dataDir, path.resolve(data));
    assert.equal(result.userData, path.resolve(user));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("banco único existente é auto-detectado e persistido atomicamente", () => {
  const { root, appData } = makeAppData();
  try {
    const osDir = makeDb(appData, "ContentFlow OS");
    const result = resolveDataLocation({ appDataDir: appData, env: {} });
    assert.equal(result.source, "auto_detected_unique");
    assert.equal(result.dataDir, osDir);
    const saved = readPrimaryConfig(appData);
    assert.equal(saved.dataDir, osDir);
    assert.equal(saved.selection_reason, "auto_detected_single_existing");
    assert.equal(saved.schema_version, 1);
    const leftovers = fs
      .readdirSync(path.join(appData, "ContentFlow"))
      .filter((name) => name.includes(".tmp."));
    assert.deepEqual(leftovers, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("config persistente válida com banco presente é respeitada", () => {
  const { root, appData } = makeAppData();
  try {
    const persisted = path.join(root, "persisted-data");
    fs.mkdirSync(persisted, { recursive: true });
    fs.writeFileSync(path.join(persisted, "contentflow.sqlite"), "-- synthetic --");
    fs.mkdirSync(path.join(appData, "ContentFlow"), { recursive: true });
    fs.writeFileSync(
      path.join(appData, "ContentFlow", CONFIG_FILENAME),
      JSON.stringify({
        schema_version: 1,
        dataDir: persisted,
        userData: root,
        selection_reason: "operator_explicit_choice",
      }),
    );
    const result = resolveDataLocation({ appDataDir: appData, env: {} });
    assert.equal(result.source, "persistent_config");
    assert.equal(result.dataDir, path.resolve(persisted));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("config inválida (JSON quebrado) bloqueia e nunca vira instalação nova", () => {
  const { root, appData } = makeAppData();
  try {
    fs.mkdirSync(path.join(appData, "ContentFlow"), { recursive: true });
    const configPath = path.join(appData, "ContentFlow", CONFIG_FILENAME);
    fs.writeFileSync(configPath, "{INVALID JSON");
    const before = fs.readFileSync(configPath, "utf8");
    assert.throws(
      () => resolveDataLocation({ appDataDir: appData, env: {} }),
      /CONTENTFLOW_CONFIG_INVALID/,
    );
    assert.equal(fs.readFileSync(configPath, "utf8"), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("config com schema inválido bloqueia sem sobrescrever", () => {
  const { root, appData } = makeAppData();
  try {
    fs.mkdirSync(path.join(appData, "ContentFlow"), { recursive: true });
    const configPath = path.join(appData, "ContentFlow", CONFIG_FILENAME);
    fs.writeFileSync(configPath, JSON.stringify({ userData: root }));
    assert.throws(
      () => resolveDataLocation({ appDataDir: appData, env: {} }),
      /CONTENTFLOW_CONFIG_INVALID/,
    );
    assert.equal(JSON.parse(fs.readFileSync(configPath, "utf8")).userData, root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("seleção persistida cujo banco desapareceu bloqueia sem criar banco vazio", () => {
  const { root, appData } = makeAppData();
  try {
    const gone = path.join(root, "gone-data");
    fs.mkdirSync(gone, { recursive: true });
    fs.mkdirSync(path.join(appData, "ContentFlow"), { recursive: true });
    const configPath = path.join(appData, "ContentFlow", CONFIG_FILENAME);
    const payload = {
      schema_version: 1,
      dataDir: gone,
      userData: root,
      selection_reason: "operator_explicit_choice",
    };
    fs.writeFileSync(configPath, JSON.stringify(payload));
    assert.throws(
      () => resolveDataLocation({ appDataDir: appData, env: {} }),
      /CONTENTFLOW_DATABASE_MISSING/,
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, "utf8")), payload);
    assert.equal(fs.existsSync(path.join(gone, "contentflow.sqlite")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("symlink quebrado no destino explícito bloqueia antes de qualquer gravação", () => {
  const { root, appData } = makeAppData();
  try {
    const link = path.join(root, "broken-link");
    fs.symlinkSync(path.join(root, "alvo-inexistente"), link);
    assert.throws(
      () =>
        resolveDataLocation({
          appDataDir: appData,
          env: { CONTENTFLOW_DESKTOP_DATA_DIR: link },
        }),
      /CONTENTFLOW_SYMLINK_INVALID/,
    );
    assert.equal(
      fs.existsSync(path.join(appData, "ContentFlow", CONFIG_FILENAME)),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("symlink quebrado na config persistida bloqueia sem sobrescrever", () => {
  const { root, appData } = makeAppData();
  try {
    const link = path.join(root, "broken-persisted");
    fs.symlinkSync(path.join(root, "alvo-inexistente"), link);
    fs.mkdirSync(path.join(appData, "ContentFlow"), { recursive: true });
    const configPath = path.join(appData, "ContentFlow", CONFIG_FILENAME);
    fs.writeFileSync(
      configPath,
      JSON.stringify({ schema_version: 1, dataDir: link, userData: root }),
    );
    assert.throws(
      () => resolveDataLocation({ appDataDir: appData, env: {} }),
      /CONTENTFLOW_SYMLINK_INVALID/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("ambiguidade sem escolha bloqueia; escolha do operador persiste", () => {
  const { root, appData } = makeAppData();
  try {
    const osDir = makeDb(appData, "ContentFlow OS");
    makeDb(appData, "ContentFlow");
    assert.throws(
      () => resolveDataLocation({ appDataDir: appData, env: {}, promptCallback: null }),
      /CONTENTFLOW_AMBIGUOUS_DATABASES/,
    );
    assert.throws(
      () =>
        resolveDataLocation({ appDataDir: appData, env: {}, promptCallback: () => null }),
      /CONTENTFLOW_AMBIGUOUS_DATABASES/,
    );
    let invoked = false;
    const chosen = resolveDataLocation({
      appDataDir: appData,
      env: {},
      promptCallback: (candidates) => {
        invoked = true;
        assert.equal(candidates.length, 2);
        return candidates.find((candidate) => candidate.id === "contentflow-os");
      },
    });
    assert.equal(invoked, true);
    assert.equal(chosen.source, "operator_prompt");
    assert.equal(chosen.dataDir, osDir);
    assert.equal(readPrimaryConfig(appData).selection_reason, "operator_explicit_choice");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("ciclo: instalação nova → banco criado → reabertura → remoção bloqueia", () => {
  const { root, appData } = makeAppData();
  try {
    const { DatabaseSync } = require("node:sqlite");

    // 1. Instalação nova: sem config e sem bancos; nada é persistido ainda.
    const fresh = resolveDataLocation({ appDataDir: appData, env: {} });
    assert.equal(fresh.source, "fresh_install_default");
    assert.equal(fresh.dataDir, path.join(appData, "ContentFlow", "data"));
    assert.equal(
      fs.existsSync(path.join(appData, "ContentFlow", CONFIG_FILENAME)),
      false,
    );

    // 2. Banco sintético criado pela API no local resolvido.
    fs.mkdirSync(fresh.dataDir, { recursive: true });
    const created = new DatabaseSync(fresh.sqliteFile);
    created.exec("CREATE TABLE probe (v TEXT); INSERT INTO probe VALUES ('sintetico');");
    created.close();

    // 3. Reabertura: banco único existente é adotado e persistido; mesmo arquivo.
    const reopened = resolveDataLocation({ appDataDir: appData, env: {} });
    assert.equal(reopened.source, "auto_detected_unique");
    assert.equal(reopened.dataDir, fresh.dataDir);
    assert.equal(readPrimaryConfig(appData).selection_reason, "auto_detected_single_existing");
    const check = new DatabaseSync(reopened.sqliteFile);
    assert.equal(check.prepare("SELECT v FROM probe").get().v, "sintetico");
    check.close();
    const configBeforeRemoval = fs.readFileSync(
      path.join(appData, "ContentFlow", CONFIG_FILENAME),
      "utf8",
    );

    // 4a. Banco removido: bloqueia, nunca trata como instalação nova.
    fs.rmSync(reopened.sqliteFile);
    assert.throws(
      () => resolveDataLocation({ appDataDir: appData, env: {} }),
      /CONTENTFLOW_DATABASE_MISSING/,
    );
    assert.equal(
      fs.readFileSync(path.join(appData, "ContentFlow", CONFIG_FILENAME), "utf8"),
      configBeforeRemoval,
    );
    assert.equal(fs.existsSync(reopened.sqliteFile), false);

    // 4b. Banco desconectado (diretório movido): também bloqueia.
    fs.mkdirSync(reopened.dataDir, { recursive: true });
    const restored = new DatabaseSync(reopened.sqliteFile);
    restored.exec("CREATE TABLE probe (v TEXT); INSERT INTO probe VALUES ('sintetico');");
    restored.close();
    const movedAway = `${reopened.dataDir}-desconectado`;
    fs.renameSync(reopened.dataDir, movedAway);
    try {
      assert.throws(
        () => resolveDataLocation({ appDataDir: appData, env: {} }),
        /CONTENTFLOW_DATABASE_MISSING/,
      );
      assert.equal(fs.existsSync(path.join(reopened.dataDir, "contentflow.sqlite")), false);
    } finally {
      fs.renameSync(movedAway, reopened.dataDir);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("helper está no empacotamento e é exigido pelo processo principal", () => {
  const packageJson = require("../package.json");
  const mainSource = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  assert.ok(packageJson.build.files.includes("desktop/data-selection.cjs"));
  assert.match(mainSource, /require\("\.\/data-selection\.cjs"\)/);
  assert.match(mainSource, /appRoot:\s*app\.getAppPath\(\)/);
});

test("falha ao persistir seleção obrigatória bloqueia sem warn silencioso", () => {
  const { root, appData } = makeAppData();
  try {
    const osDir = makeDb(appData, "ContentFlow OS");
    const dbFile = path.join(osDir, "contentflow.sqlite");
    const dbBefore = fs.readFileSync(dbFile);
    const configDir = path.join(appData, "ContentFlow");
    fs.mkdirSync(configDir, { recursive: true });
    fs.chmodSync(configDir, 0o555);
    try {
      assert.throws(
        () => resolveDataLocation({ appDataDir: appData, env: {} }),
        /CONTENTFLOW_CONFIG_WRITE_FAILED/,
      );
    } finally {
      fs.chmodSync(configDir, 0o755);
    }
    // Zero gravações: sem config, banco intacto, sem temporários órfãos.
    assert.equal(fs.existsSync(path.join(configDir, CONFIG_FILENAME)), false);
    assert.deepEqual(fs.readFileSync(dbFile), dbBefore);
    assert.deepEqual(
      fs.readdirSync(configDir).filter((name) => name.includes(".tmp.")),
      [],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("destino dentro do bundle é recusado antes de qualquer gravação", () => {
  const { root, appData } = makeAppData();
  try {
    const appRoot = path.join(root, "Candidate.app", "Contents", "Resources", "app");
    fs.mkdirSync(appRoot, { recursive: true });
    assert.throws(
      () =>
        resolveDataLocation({
          appDataDir: appData,
          appRoot,
          env: { CONTENTFLOW_DESKTOP_DATA_DIR: path.join(appRoot, "data") },
        }),
      /CONTENTFLOW_DATA_INSIDE_APPLICATION/,
    );
    assert.equal(
      fs.existsSync(path.join(appData, "ContentFlow", CONFIG_FILENAME)),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("sqlite existente como diretório bloqueia a descoberta (nunca fresh)", () => {
  const { root, appData } = makeAppData();
  try {
    const dataDir = path.join(appData, "ContentFlow", "data");
    fs.mkdirSync(path.join(dataDir, "contentflow.sqlite"), { recursive: true });
    assert.throws(
      () => resolveDataLocation({ appDataDir: appData, env: {} }),
      /CONTENTFLOW_DATABASE_INVALID/,
    );
    assert.equal(
      fs.existsSync(path.join(appData, "ContentFlow", CONFIG_FILENAME)),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("sqlite como symlink quebrado bloqueia a descoberta (nunca fresh)", () => {
  const { root, appData } = makeAppData();
  try {
    const dataDir = path.join(appData, "ContentFlow", "data");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.symlinkSync(
      path.join(root, "alvo-inexistente"),
      path.join(dataDir, "contentflow.sqlite"),
    );
    assert.throws(
      () => resolveDataLocation({ appDataDir: appData, env: {} }),
      /CONTENTFLOW_SYMLINK_INVALID/,
    );
    assert.equal(
      fs.existsSync(path.join(appData, "ContentFlow", CONFIG_FILENAME)),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("sqlite da seleção persistida como diretório bloqueia sem alterar config", () => {
  const { root, appData } = makeAppData();
  try {
    const persisted = path.join(root, "persisted-data");
    fs.mkdirSync(path.join(persisted, "contentflow.sqlite"), { recursive: true });
    fs.mkdirSync(path.join(appData, "ContentFlow"), { recursive: true });
    const configPath = path.join(appData, "ContentFlow", CONFIG_FILENAME);
    fs.writeFileSync(
      configPath,
      JSON.stringify({ schema_version: 1, dataDir: persisted, userData: root }),
    );
    const before = fs.readFileSync(configPath, "utf8");
    assert.throws(
      () => resolveDataLocation({ appDataDir: appData, env: {} }),
      /CONTENTFLOW_DATABASE_INVALID/,
    );
    assert.equal(fs.readFileSync(configPath, "utf8"), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("CONTENTFLOW_ELECTRON_USER_DATA_DIR sozinha é respeitada", () => {
  const { root, appData } = makeAppData();
  try {
    const user = path.join(root, "user");
    fs.mkdirSync(user, { recursive: true });
    const result = resolveDataLocation({
      appDataDir: appData,
      env: { CONTENTFLOW_ELECTRON_USER_DATA_DIR: user },
    });
    assert.equal(result.source, "env_explicit");
    assert.equal(result.userData, path.resolve(user));
    assert.equal(result.dataDir, path.join(path.resolve(user), "data"));
    assert.equal(
      fs.existsSync(path.join(appData, "ContentFlow", CONFIG_FILENAME)),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("destino de configuração bloqueado por arquivo não vira instalação nova", () => {
  const { root, appData } = makeAppData();
  try {
    makeDb(appData, "ContentFlow OS");
    fs.writeFileSync(path.join(appData, "ContentFlow"), "arquivo bloqueando o diretório");
    assert.throws(
      () => resolveDataLocation({ appDataDir: appData, env: {} }),
      /CONTENTFLOW_CONFIG_INVALID/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("ancestral com symlink quebrado bloqueia em vez de fresh", () => {
  const { root, appData } = makeAppData();
  try {
    fs.symlinkSync(
      path.join(root, "destino-ausente"),
      path.join(appData, "ContentFlow OS"),
    );
    assert.throws(
      () => resolveDataLocation({ appDataDir: appData, env: {} }),
      /CONTENTFLOW_SYMLINK_INVALID/,
    );
    // Zero gravações: nenhum outro diretório selecionado, nenhuma config.
    assert.equal(
      fs.existsSync(path.join(appData, "ContentFlow", CONFIG_FILENAME)),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("sqlite com destino físico dentro do bundle bloqueia a descoberta", () => {
  const { root, appData } = makeAppData();
  try {
    const appRoot = path.join(root, "Candidate.app", "Contents", "Resources", "app");
    fs.mkdirSync(appRoot, { recursive: true });
    const inner = path.join(appRoot, "inner.sqlite");
    fs.writeFileSync(inner, "-- synthetic inner db --");
    const dataDir = path.join(appData, "ContentFlow", "data");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.symlinkSync(inner, path.join(dataDir, "contentflow.sqlite"));
    assert.throws(
      () => resolveDataLocation({ appDataDir: appData, appRoot, env: {} }),
      /CONTENTFLOW_DATA_INSIDE_APPLICATION/,
    );
    assert.equal(
      fs.existsSync(path.join(appData, "ContentFlow", CONFIG_FILENAME)),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("env cujo sqlite aponta para dentro do bundle bloqueia sem gravar", () => {
  const { root, appData } = makeAppData();
  try {
    const appRoot = path.join(root, "Candidate.app", "Contents", "Resources", "app");
    fs.mkdirSync(appRoot, { recursive: true });
    const inner = path.join(appRoot, "inner.sqlite");
    fs.writeFileSync(inner, "-- synthetic inner db --");
    const data = path.join(root, "ext-data");
    fs.mkdirSync(data, { recursive: true });
    fs.symlinkSync(inner, path.join(data, "contentflow.sqlite"));
    assert.throws(
      () =>
        resolveDataLocation({
          appDataDir: appData,
          appRoot,
          env: { CONTENTFLOW_DESKTOP_DATA_DIR: data },
        }),
      /CONTENTFLOW_DATA_INSIDE_APPLICATION/,
    );
    assert.equal(
      fs.existsSync(path.join(appData, "ContentFlow", CONFIG_FILENAME)),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("persistente cujo sqlite aponta para dentro do bundle bloqueia sem alterar config", () => {
  const { root, appData } = makeAppData();
  try {
    const appRoot = path.join(root, "Candidate.app", "Contents", "Resources", "app");
    fs.mkdirSync(appRoot, { recursive: true });
    const inner = path.join(appRoot, "inner.sqlite");
    fs.writeFileSync(inner, "-- synthetic inner db --");
    const persisted = path.join(root, "persisted-data");
    fs.mkdirSync(persisted, { recursive: true });
    fs.symlinkSync(inner, path.join(persisted, "contentflow.sqlite"));
    fs.mkdirSync(path.join(appData, "ContentFlow"), { recursive: true });
    const configPath = path.join(appData, "ContentFlow", CONFIG_FILENAME);
    fs.writeFileSync(
      configPath,
      JSON.stringify({ schema_version: 1, dataDir: persisted, userData: root }),
    );
    const before = fs.readFileSync(configPath, "utf8");
    assert.throws(
      () => resolveDataLocation({ appDataDir: appData, appRoot, env: {} }),
      /CONTENTFLOW_DATA_INSIDE_APPLICATION/,
    );
    assert.equal(fs.readFileSync(configPath, "utf8"), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("symlink válido para destino externo segue permitido", () => {
  const { root, appData } = makeAppData();
  try {
    const real = path.join(root, "real-appdata");
    fs.mkdirSync(real, { recursive: true });
    const osDir = path.join(real, "ContentFlow OS", "data");
    fs.mkdirSync(osDir, { recursive: true });
    fs.writeFileSync(path.join(osDir, "contentflow.sqlite"), "-- synthetic --");
    const alias = path.join(root, "alias-appdata");
    fs.symlinkSync(real, alias, "dir");
    const result = resolveDataLocation({ appDataDir: alias, env: {} });
    assert.equal(result.source, "auto_detected_unique");
    assert.equal(result.dataDir, path.join(alias, "ContentFlow OS", "data"));
    assert.equal(
      readPrimaryConfig(alias).selection_reason,
      "auto_detected_single_existing",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
