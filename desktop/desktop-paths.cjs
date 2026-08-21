const path = require("node:path");

function runtimeExecutable(runtimeRoot, platform = process.platform) {
  return path.join(runtimeRoot, platform === "win32" ? "node.exe" : "node");
}

function isPathInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertWritableDataOutsideApp(appRoot, dataRoot) {
  if (isPathInside(appRoot, dataRoot)) {
    throw new Error("A pasta de dados do ContentFlow OS não pode ficar dentro do aplicativo.");
  }
}

function resolveDesktopDataRoot(defaultRoot, configuredRoot) {
  const configured = configuredRoot?.trim();
  return path.resolve(configured || defaultRoot);
}

module.exports = {
  assertWritableDataOutsideApp,
  isPathInside,
  resolveDesktopDataRoot,
  runtimeExecutable,
};
