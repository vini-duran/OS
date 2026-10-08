import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import macosPlatform from "./macos-platform.cjs";

const { getKeyringPackageInfo } = macosPlatform;
const require = createRequire(import.meta.url);

const targetPlatform = process.env.TARGET_PLATFORM || process.platform;
const targetArch = process.env.TARGET_ARCH || process.arch;

const { packageName, bindingFile, label } = getKeyringPackageInfo(targetPlatform, targetArch);

let packageJsonPath;
try {
  packageJsonPath = require.resolve(`${packageName}/package.json`);
} catch {
  throw new Error(
    `Dependência nativa obrigatória ausente: ${packageName}. A release ${label} seria incapaz de iniciar a API local.`,
  );
}

const bindingPath = path.join(path.dirname(packageJsonPath), bindingFile);

if (!existsSync(bindingPath)) {
  throw new Error(
    `Dependência nativa obrigatória ausente: ${packageName}. A release ${label} seria incapaz de iniciar a API local.`,
  );
}

console.log(`Dependência nativa ${label} validada: ${bindingPath}`);
