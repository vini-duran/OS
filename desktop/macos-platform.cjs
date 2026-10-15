const fs = require("node:fs");
const path = require("node:path");

function getNodeBinaryName(platform = process.platform) {
  return platform === "win32" ? "node.exe" : "node";
}

function resolveNodeExecutable(runtimeRoot, platform = process.platform) {
  return path.join(runtimeRoot, getNodeBinaryName(platform));
}

function ensureExecutableBit(filePath, platform = process.platform) {
  if (platform === "win32") return;
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado para permissão executável: ${filePath}`);
  }
  fs.chmodSync(filePath, 0o755);
}

function getKeyringPackageInfo(platform = process.platform, arch = process.arch) {
  if (platform === "win32") {
    return {
      packageName: "@napi-rs/keyring-win32-x64-msvc",
      bindingFile: "keyring.win32-x64-msvc.node",
      label: "Windows",
    };
  }

  if (platform === "darwin") {
    if (arch === "arm64") {
      return {
        packageName: "@napi-rs/keyring-darwin-arm64",
        bindingFile: "keyring.darwin-arm64.node",
        label: "macOS arm64",
      };
    }
    if (arch === "x64") {
      return {
        packageName: "@napi-rs/keyring-darwin-x64",
        bindingFile: "keyring.darwin-x64.node",
        label: "macOS x64",
      };
    }
    throw new Error(`Arquitetura darwin não suportada: ${arch}`);
  }

  throw new Error(`Plataforma não suportada para validação nativa do keyring: ${platform}`);
}

function applyDataIsolation(app, environment = process.env) {
  if (environment.CONTENTFLOW_ELECTRON_APP_DATA_DIR) {
    app.setPath("appData", path.resolve(environment.CONTENTFLOW_ELECTRON_APP_DATA_DIR));
  }
  if (environment.CONTENTFLOW_ELECTRON_USER_DATA_DIR) {
    app.setPath("userData", path.resolve(environment.CONTENTFLOW_ELECTRON_USER_DATA_DIR));
  }
}

function shouldUsePersistedDataSelection(platform = process.platform) {
  return platform === "darwin";
}

function getEffectiveMacOSAppDataDir(app, environment = process.env) {
  if (environment.CONTENTFLOW_ELECTRON_APP_DATA_DIR) {
    return path.resolve(environment.CONTENTFLOW_ELECTRON_APP_DATA_DIR);
  }
  if (environment.CONTENTFLOW_APPDATA_DIR) {
    return path.resolve(environment.CONTENTFLOW_APPDATA_DIR);
  }
  return app.getPath("appData");
}

function selectDataCandidateByIndex(candidates, chosenIndex) {
  if (chosenIndex === null || chosenIndex === undefined) return null;
  const index = Number(chosenIndex);
  if (!Number.isInteger(index) || index < 0 || index >= candidates.length) return null;
  return candidates[index];
}

module.exports = {
  applyDataIsolation,
  ensureExecutableBit,
  getEffectiveMacOSAppDataDir,
  getKeyringPackageInfo,
  getNodeBinaryName,
  resolveNodeExecutable,
  selectDataCandidateByIndex,
  shouldUsePersistedDataSelection,
};
