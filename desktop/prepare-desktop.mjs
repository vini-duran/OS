import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";

const projectRoot = process.cwd();
const runtimeDirectory = path.join(projectRoot, "desktop-runtime");
const desktopBuildDirectory = path.join(projectRoot, "desktop-dist");
const nodeMajor = Number(process.versions.node.split(".")[0]);
const runtimeNodeName = process.platform === "win32" ? "node.exe" : "node";
const targetArchitecture = process.env.CONTENTFLOW_DESKTOP_TARGET_ARCH;

if (nodeMajor !== 26) {
  throw new Error(`A V0 precisa ser montada com Node 26; versão atual: ${process.versions.node}.`);
}
if (targetArchitecture && targetArchitecture !== process.arch) {
  throw new Error(
    `O runtime Node privado precisa usar a arquitetura nativa. Solicitada: ${targetArchitecture}; atual: ${process.arch}.`,
  );
}

mkdirSync(runtimeDirectory, { recursive: true });
mkdirSync(desktopBuildDirectory, { recursive: true });
if (process.platform === "darwin") {
  const nodeLibraryDirectory = path.resolve(path.dirname(process.execPath), "..", "lib");
  if (existsSync(nodeLibraryDirectory)) {
    for (const libraryName of readdirSync(nodeLibraryDirectory)) {
      if (/^libnode\..+\.dylib$/.test(libraryName)) {
        const bundledLibraryPath = path.join(runtimeDirectory, libraryName);
        if (existsSync(bundledLibraryPath)) chmodSync(bundledLibraryPath, 0o644);
        copyFileSync(path.join(nodeLibraryDirectory, libraryName), bundledLibraryPath);
      }
    }
  }
}
const bundledNodePath = path.join(runtimeDirectory, runtimeNodeName);
if (process.platform !== "win32" && existsSync(bundledNodePath)) chmodSync(bundledNodePath, 0o755);
const bundledNodeVersion = existsSync(bundledNodePath)
  ? execFileSync(bundledNodePath, ["--version"], { encoding: "utf8" }).trim()
  : undefined;
if (bundledNodeVersion !== `v${process.versions.node}`) {
  copyFileSync(process.execPath, bundledNodePath);
  if (process.platform !== "win32") chmodSync(bundledNodePath, 0o755);
}

const nodeLicenseCandidates = [
  path.join(path.dirname(process.execPath), "LICENSE"),
  path.join(path.dirname(process.execPath), "..", "LICENSE"),
];
const nodeLicense = nodeLicenseCandidates.find(existsSync);
if (nodeLicense) copyFileSync(nodeLicense, path.join(runtimeDirectory, "NODE_LICENSE.txt"));
else {
  writeFileSync(
    path.join(runtimeDirectory, "NODE_RUNTIME_NOTICE.txt"),
    `Node.js ${process.versions.node} runtime. License: https://github.com/nodejs/node/blob/v${process.versions.node}/LICENSE`,
    "utf8",
  );
}

await build({
  entryPoints: [path.join(projectRoot, "server", "index.ts")],
  outfile: path.join(desktopBuildDirectory, "api.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node26",
  sourcemap: false,
  external: ["better-sqlite3", "@napi-rs/keyring"],
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});

const packageJsonPath = path.join(projectRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: projectRoot,
  encoding: "utf8",
}).trim();

writeFileSync(
  path.join(desktopBuildDirectory, "build-info.json"),
  JSON.stringify(
    {
      version: packageJson.version,
      node: process.versions.node,
      platform: process.platform,
      architecture: process.arch,
      sourceCommit,
      canonical_repository: "https://github.com/vini-duran/OS",
      canonical_branch: "codex/v0.5.2-candidate",
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  ),
  "utf8",
);
