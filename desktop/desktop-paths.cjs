const { realpathSync } = require("node:fs");
const path = require("node:path");

// Resolve existing ancestors too: a not-yet-created data folder may use a symlink.
function physicalPath(value) {
  const resolved = path.resolve(value);
  try {
    return realpathSync(resolved);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const parent = path.dirname(resolved);
    if (parent === resolved) throw error;
    return path.join(physicalPath(parent), path.basename(resolved));
  }
}

function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative))
  );
}

function assertWritableDataOutsideApp(appRoot, dataRoot) {
  const root = physicalPath(appRoot);
  const destination = physicalPath(dataRoot);
  let bundle = root;
  while (path.dirname(bundle) !== bundle && !bundle.toLowerCase().endsWith(".app")) {
    bundle = path.dirname(bundle);
  }
  if (
    isPathInside(root, destination) ||
    (bundle.toLowerCase().endsWith(".app") && isPathInside(bundle, destination))
  ) {
    throw new Error("CONTENTFLOW_DATA_INSIDE_APPLICATION");
  }
}

module.exports = { assertWritableDataOutsideApp };
