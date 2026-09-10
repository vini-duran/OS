const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { mkdtempSync, mkdirSync, symlinkSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { assertWritableDataOutsideApp } = require("./desktop-paths.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));
const desktopMain = readFileSync(path.join(__dirname, "main.cjs"), "utf8");
const desktopPreload = readFileSync(path.join(__dirname, "preload.cjs"), "utf8");

test("proteção de dados integra pacote e precede criação de userData e API", () => {
  assert.ok(packageJson.build.files.includes("desktop/desktop-paths.cjs"));
  assert.ok(
    desktopMain.indexOf("assertWritableDataOutsideApp(\n") <
      desktopMain.indexOf("mkdirSync(customUserData"),
  );
  assert.ok(
    desktopMain.indexOf("assertWritableDataOutsideApp(appRoot, dataRoot)") <
      desktopMain.indexOf("const apiPort = await reservePort()"),
  );
});

test("dados fora do bundle são aceitos; caminhos internos e symlinks são recusados", () => {
  const root = mkdtempSync(path.join(tmpdir(), "contentflow-path-guard-"));
  try {
    const bundle = path.join(root, "Candidate.app");
    const appRoot = path.join(bundle, "Contents", "Resources", "app");
    mkdirSync(appRoot, { recursive: true });
    for (const destination of [appRoot, path.join(appRoot, "data"), path.join(bundle, "data")]) {
      assert.throws(
        () => assertWritableDataOutsideApp(appRoot, destination),
        /CONTENTFLOW_DATA_INSIDE_APPLICATION/,
      );
    }
    assert.doesNotThrow(() =>
      assertWritableDataOutsideApp(appRoot, path.join(root, "userData", "data")),
    );
    assert.doesNotThrow(() =>
      assertWritableDataOutsideApp(appRoot, path.join(root, "Candidate.app-other", "data")),
    );
    const link = path.join(root, "alias");
    symlinkSync(bundle, link, "dir");
    assert.throws(
      () => assertWritableDataOutsideApp(appRoot, path.join(link, "future", "data")),
      /CONTENTFLOW_DATA_INSIDE_APPLICATION/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a distribuição do núcleo não incorpora plugins de referência", () => {
  const packagedSources = [
    ...(packageJson.build.files ?? []),
    ...(packageJson.build.extraResources ?? []),
  ].map((entry) => (typeof entry === "string" ? entry : entry.from));

  assert.equal(
    packagedSources.some((source) => /ecosystem[\\/]plugins|plugins[\\/]reference/i.test(source)),
    false,
  );
  assert.match(
    desktopMain,
    /CONTENTFLOW_INSTALLED_PLUGINS_DIR\s*=\s*path\.join\(dataRoot,\s*"plugins",\s*"installed"\)/,
  );
});

test("atualizações preservam plugins, mas o instalador não os fornece", () => {
  assert.equal(packageJson.build.nsis.deleteAppDataOnUninstall, false);
  assert.equal(packageJson.build.files.includes("ecosystem/plugins/reference/**/*"), false);
});

test("distribui a Browser Bridge separadamente em uma pasta estável", () => {
  const bridgeResource = packageJson.build.extraResources.find(
    (entry) => typeof entry === "object" && entry.from === "ecosystem/browser-bridge",
  );
  assert.equal(bridgeResource.to, "browser-bridge");
  assert.ok(bridgeResource.filter.includes("manifest.json"));
  assert.ok(bridgeResource.filter.includes("service-worker.js"));
  assert.ok(bridgeResource.filter.includes("content-script.js"));
});

test("dependências requeridas pela API empacotada são dependências de produção", () => {
  assert.equal(packageJson.dependencies.archiver, "^7.0.1");
  assert.equal(packageJson.devDependencies.archiver, undefined);
});

test("o Electron inicia fechado, isolado e sem bloquear no stdout da API", () => {
  assert.match(desktopMain, /show:\s*false/);
  assert.match(desktopMain, /contextIsolation:\s*true/);
  assert.match(desktopMain, /nodeIntegration:\s*false/);
  assert.match(desktopMain, /sandbox:\s*true/);
  assert.match(desktopMain, /stdio:\s*\["ignore",\s*"ignore",\s*"pipe"\]/);
  assert.match(desktopMain, /ready-to-show/);
});

test("a API inesperadamente encerrada também fecha o Electron quando retorna código zero", () => {
  assert.match(desktopMain, /if\s*\(!quitting\s*&&\s*apiReady\)/);
  assert.doesNotMatch(desktopMain, /if\s*\(code\s*&&\s*!quitting\)/);
});

test("pendências humanas atualizam badge e notificações pelo preload isolado", () => {
  assert.match(desktopMain, /setOverlayIcon/);
  assert.match(desktopMain, /tone === "error"/);
  assert.match(desktopMain, /value\.severity === "error"/);
  assert.match(desktopMain, /new Notification/);
  assert.match(desktopMain, /notification\.on\("click"/);
  assert.match(desktopPreload, /humanTasks:\s*Object\.freeze/);
  assert.match(desktopPreload, /ipcRenderer\.send\(HUMAN_TASKS_UPDATE_CHANNEL/);
  assert.doesNotMatch(desktopPreload, /contextBridge\.exposeInMainWorld\([^)]*ipcRenderer/s);
});
