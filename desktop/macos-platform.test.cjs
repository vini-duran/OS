const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");

const {
  applyDataIsolation,
  ensureExecutableBit,
  getEffectiveMacOSAppDataDir,
  getKeyringPackageInfo,
  getNodeBinaryName,
  resolveNodeExecutable,
  selectDataCandidateByIndex,
  shouldUsePersistedDataSelection,
} = require("./macos-platform.cjs");

const { RELEASES_URL, configureDesktopUpdater, createInitialState } = require("./updater.cjs");

test("seleciona nome do executável node por plataforma", () => {
  assert.equal(getNodeBinaryName("win32"), "node.exe");
  assert.equal(getNodeBinaryName("darwin"), "node");
  assert.equal(getNodeBinaryName("linux"), "node");
});

test("resolve caminho do executável node no runtime", () => {
  const runtimeDir = path.join("/opt", "contentflow", "runtime");
  assert.equal(resolveNodeExecutable(runtimeDir, "win32"), path.join(runtimeDir, "node.exe"));
  assert.equal(resolveNodeExecutable(runtimeDir, "darwin"), path.join(runtimeDir, "node"));
});

test("seleciona pacote e binding nativo de keyring conforme plataforma e arquitetura", () => {
  const win = getKeyringPackageInfo("win32", "x64");
  assert.equal(win.packageName, "@napi-rs/keyring-win32-x64-msvc");
  assert.equal(win.bindingFile, "keyring.win32-x64-msvc.node");
  assert.equal(win.label, "Windows");

  const macArm64 = getKeyringPackageInfo("darwin", "arm64");
  assert.equal(macArm64.packageName, "@napi-rs/keyring-darwin-arm64");
  assert.equal(macArm64.bindingFile, "keyring.darwin-arm64.node");
  assert.equal(macArm64.label, "macOS arm64");

  const macX64 = getKeyringPackageInfo("darwin", "x64");
  assert.equal(macX64.packageName, "@napi-rs/keyring-darwin-x64");
  assert.equal(macX64.bindingFile, "keyring.darwin-x64.node");
  assert.equal(macX64.label, "macOS x64");

  assert.throws(() => getKeyringPackageInfo("darwin", "ia32"), /darwin não suportada/);
  assert.throws(() => getKeyringPackageInfo("aix", "ppc64"), /Plataforma não suportada/);
});

test("isola diretório de dados em laboratório respeitando ordem de precedência", () => {
  const calls = [];
  const mockApp = {
    setPath(name, resolvedPath) {
      calls.push({ name, path: resolvedPath });
    },
  };

  applyDataIsolation(mockApp, {
    CONTENTFLOW_ELECTRON_APP_DATA_DIR: "/tmp/lab-app-data",
    CONTENTFLOW_ELECTRON_USER_DATA_DIR: "/tmp/lab-user-data",
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].name, "appData");
  assert.equal(calls[0].path, path.resolve("/tmp/lab-app-data"));
  assert.equal(calls[1].name, "userData");
  assert.equal(calls[1].path, path.resolve("/tmp/lab-user-data"));
});

test("mantém diretórios padrão quando variáveis de ambiente de laboratório estão ausentes", () => {
  const calls = [];
  const mockApp = {
    setPath(name, resolvedPath) {
      calls.push({ name, path: resolvedPath });
    },
  };

  applyDataIsolation(mockApp, {});
  assert.equal(calls.length, 0);
});

test("updater no macOS retorna status unsupported e mensagem segura sem strings não traduzidas", () => {
  const fakeApp = { isPackaged: true, getVersion: () => "1.3.5" };

  const macState = createInitialState(fakeApp, "installer", "darwin");
  assert.equal(macState.status, "unsupported");
  assert.equal(macState.distribution, "installer");
  assert.equal(macState.currentVersion, "1.3.5");
  assert.match(macState.message, /somente no aplicativo instalado/);

  const winState = createInitialState(fakeApp, "installer", "win32");
  assert.equal(winState.status, "idle");
  assert.equal(winState.distribution, "installer");
});

test("configureDesktopUpdater no macOS não instancia autoUpdater e permite abrir releases", async () => {
  const fakeApp = { isPackaged: true, getVersion: () => "1.3.5" };
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
  const openedUrls = [];
  const shell = {
    async openExternal(url) {
      openedUrls.push(url);
    },
  };
  const getWindow = () => ({
    isDestroyed: () => false,
    webContents: { send: () => {} },
  });

  const controller = configureDesktopUpdater({
    app: fakeApp,
    ipcMain,
    shell,
    getWindow,
    updater: { on() {} },
    platform: "darwin",
  });

  const state = controller.getState();
  assert.equal(state.status, "unsupported");

  // check não deve disparar erro nem buscar nada na rede
  const checkResult = await handlers.get("contentflow:updater:check")();
  assert.equal(checkResult.status, "unsupported");

  // download não deve falhar nem tentar baixar instalador
  const downloadResult = await handlers.get("contentflow:updater:download")();
  assert.equal(downloadResult.status, "unsupported");

  // install não deve falhar
  const installResult = handlers.get("contentflow:updater:install")();
  assert.equal(installResult.status, "unsupported");

  // open-releases abre URL oficial de releases
  await handlers.get("contentflow:updater:open-releases")();
  assert.deepEqual(openedUrls, [RELEASES_URL]);
});

test("configuração electron-builder para macOS estende base e cumpre requisitos de empacotamento", () => {
  const macConfig = require("../electron-builder.macos.cjs");

  assert.equal(macConfig.publish, null, "publish deve ser estritamente null");
  assert.equal(
    macConfig.appId,
    "com.contentflow.app",
    "appId com.contentflow.app deve ser preservado",
  );
  assert.equal(macConfig.productName, "ContentFlow", "productName deve ser ContentFlow");
  assert.equal(macConfig.asar, false, "asar deve ser false conforme base");
  assert.equal(macConfig.npmRebuild, false, "npmRebuild deve ser false conforme base");

  assert.ok(Array.isArray(macConfig.files), "files deve ser um array");
  assert.ok(
    macConfig.files.includes("desktop/macos-platform.cjs"),
    "files deve incluir desktop/macos-platform.cjs",
  );

  assert.ok(macConfig.mac, "configuração mac deve existir");
  assert.deepEqual(
    macConfig.mac.target,
    [{ target: "dir", arch: ["arm64"] }],
    "alvo deve ser dir arm64",
  );
  assert.equal(macConfig.mac.identity, "-", "assinatura deve ser ad-hoc (identity: '-')");
  assert.equal(macConfig.mac.minimumSystemVersion, "13.5", "mínimo deve cobrir o Node26 ARM64 incluído");
  assert.equal(macConfig.mac.notarize, false, "notarização deve ser false sem regras inventadas");

  assert.equal(macConfig.win, undefined, "configuração win não deve estar ativa no mac");
  assert.equal(macConfig.nsis, undefined, "configuração nsis não deve estar ativa no mac");
  assert.equal(macConfig.portable, undefined, "configuração portable não deve estar ativa no mac");
});

test("preserva bit executável em plataformas não-Windows", () => {
  let chmodTarget = null;
  let chmodMode = null;
  const originalChmodSync = fs.chmodSync;
  const originalExistsSync = fs.existsSync;
  try {
    fs.existsSync = () => true;
    fs.chmodSync = (targetPath, mode) => {
      chmodTarget = targetPath;
      chmodMode = mode;
    };

    ensureExecutableBit("/fake/path/node", "darwin");
    assert.equal(chmodTarget, "/fake/path/node");
    assert.equal(chmodMode, 0o755);

    chmodTarget = null;
    chmodMode = null;
    ensureExecutableBit("/fake/path/node.exe", "win32");
    assert.equal(chmodTarget, null);
    assert.equal(chmodMode, null);
  } finally {
    fs.chmodSync = originalChmodSync;
    fs.existsSync = originalExistsSync;
  }
});

test("ensureExecutableBit falha se arquivo ausente ou se chmod falhar", () => {
  const originalChmodSync = fs.chmodSync;
  const originalExistsSync = fs.existsSync;
  try {
    fs.existsSync = () => false;
    assert.throws(() => ensureExecutableBit("/fake/missing", "darwin"), /Arquivo não encontrado/);

    fs.existsSync = () => true;
    fs.chmodSync = () => {
      throw new Error("EPERM: operation not permitted");
    };
    assert.throws(() => ensureExecutableBit("/fake/node", "darwin"), /EPERM/);
  } finally {
    fs.chmodSync = originalChmodSync;
    fs.existsSync = originalExistsSync;
  }
});

test("seleção persistida em pasta externa preserva dado e config exatos", () => {
  const os = require("node:os");
  const { resolveDataLocation, CONFIG_FILENAME } = require("./data-selection.cjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "contentflow-macos-persisted-"));
  try {
    const appData = path.join(root, "Application Support");
    fs.mkdirSync(appData, { recursive: true });
    const external = path.join(root, "externo-dados");
    const externalUser = path.join(root, "externo-user");
    fs.mkdirSync(external, { recursive: true });
    fs.mkdirSync(externalUser, { recursive: true });
    fs.writeFileSync(path.join(external, "contentflow.sqlite"), "-- synthetic db --");
    fs.mkdirSync(path.join(appData, "ContentFlow"), { recursive: true });
    const configPath = path.join(appData, "ContentFlow", CONFIG_FILENAME);
    const payload = {
      schema_version: 1,
      dataDir: external,
      userData: externalUser,
      selection_reason: "operator_explicit_choice",
    };
    fs.writeFileSync(configPath, JSON.stringify(payload));
    const dbBefore = fs.readFileSync(path.join(external, "contentflow.sqlite"));
    const mockApp = { getPath: () => appData };
    const effective = getEffectiveMacOSAppDataDir(mockApp, {});
    assert.equal(effective, appData);
    const result = resolveDataLocation({ appDataDir: effective, env: {} });
    assert.equal(result.source, "persistent_config");
    assert.equal(result.dataDir, path.resolve(external));
    assert.equal(result.userData, path.resolve(externalUser));
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, "utf8")), payload);
    assert.deepEqual(fs.readFileSync(path.join(external, "contentflow.sqlite")), dbBefore);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("ambiente explícito isolado prevalece sobre config persistida sem gravar", () => {
  const os = require("node:os");
  const { resolveDataLocation, CONFIG_FILENAME } = require("./data-selection.cjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "contentflow-macos-env-"));
  try {
    const appData = path.join(root, "Application Support");
    fs.mkdirSync(appData, { recursive: true });
    const persisted = path.join(root, "persisted-data");
    fs.mkdirSync(persisted, { recursive: true });
    fs.writeFileSync(path.join(persisted, "contentflow.sqlite"), "-- persisted --");
    fs.mkdirSync(path.join(appData, "ContentFlow"), { recursive: true });
    const configPath = path.join(appData, "ContentFlow", CONFIG_FILENAME);
    const payload = {
      schema_version: 1,
      dataDir: persisted,
      userData: root,
      selection_reason: "operator_explicit_choice",
    };
    fs.writeFileSync(configPath, JSON.stringify(payload));
    const isolatedData = path.join(root, "isolado-data");
    const isolatedUser = path.join(root, "isolado-user");
    fs.mkdirSync(isolatedData, { recursive: true });
    fs.mkdirSync(isolatedUser, { recursive: true });
    const result = resolveDataLocation({
      appDataDir: appData,
      env: {
        CONTENTFLOW_DESKTOP_DATA_DIR: isolatedData,
        CONTENTFLOW_ELECTRON_USER_DATA_DIR: isolatedUser,
      },
    });
    assert.equal(result.source, "env_explicit");
    assert.equal(result.dataDir, path.resolve(isolatedData));
    assert.equal(result.userData, path.resolve(isolatedUser));
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, "utf8")), payload);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("falta de banco selecionado bloqueia sem criar base vazia", () => {
  const os = require("node:os");
  const { resolveDataLocation, CONFIG_FILENAME } = require("./data-selection.cjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "contentflow-macos-missing-"));
  try {
    const appData = path.join(root, "Application Support");
    fs.mkdirSync(appData, { recursive: true });
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

test("Windows e Linux preservam comportamento sem seleção persistida", () => {
  assert.equal(shouldUsePersistedDataSelection("win32"), false);
  assert.equal(shouldUsePersistedDataSelection("linux"), false);
  assert.equal(shouldUsePersistedDataSelection("darwin"), true);
  const mainSource = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  assert.match(mainSource, /shouldUsePersistedDataSelection\(process\.platform\)/);
  assert.match(mainSource, /require\("\.\/data-selection\.cjs"\)/);
  assert.match(mainSource, /appRoot:\s*app\.getAppPath\(\)/);
  assert.match(mainSource, /targetApp\.setPath\("userData", selected\.userData\)/);
});

test("diretório appData efetivo respeita precedência sem adivinhar caminho", () => {
  const mockApp = {
    getPath: (name) => (name === "appData" ? "/padrao/app-data" : "/padrao/outro"),
  };
  assert.equal(
    getEffectiveMacOSAppDataDir(mockApp, { CONTENTFLOW_ELECTRON_APP_DATA_DIR: "/tmp/candidata" }),
    path.resolve("/tmp/candidata"),
  );
  assert.equal(
    getEffectiveMacOSAppDataDir(mockApp, { CONTENTFLOW_APPDATA_DIR: "/tmp/legado" }),
    path.resolve("/tmp/legado"),
  );
  assert.equal(getEffectiveMacOSAppDataDir(mockApp, {}), "/padrao/app-data");
  assert.equal(
    getEffectiveMacOSAppDataDir(mockApp, {
      CONTENTFLOW_ELECTRON_APP_DATA_DIR: "/tmp/candidata",
      CONTENTFLOW_APPDATA_DIR: "/tmp/legado",
    }),
    path.resolve("/tmp/candidata"),
  );
});

test("mapeador índice→candidato retorna objeto exato e null ao cancelar", () => {
  const candidates = [
    { id: "a", label: "A", userData: "/u/a", dataDir: "/u/a/data" },
    { id: "b", label: "B", userData: "/u/b", dataDir: "/u/outro" },
  ];
  assert.equal(selectDataCandidateByIndex(candidates, 1), candidates[1]);
  assert.equal(selectDataCandidateByIndex(candidates, 0).dataDir, "/u/a/data");
  assert.equal(selectDataCandidateByIndex(candidates, null), null);
  assert.equal(selectDataCandidateByIndex(candidates, 5), null);
});

test("empacotamento macOS inclui seletor reutilizado e resolvedor de caminhos", () => {
  const macConfig = require("../electron-builder.macos.cjs");
  assert.ok(
    macConfig.files.includes("desktop/data-selection.cjs"),
    "files deve incluir desktop/data-selection.cjs",
  );
  assert.ok(
    macConfig.files.includes("desktop/desktop-paths.cjs"),
    "files deve incluir desktop/desktop-paths.cjs",
  );
});
