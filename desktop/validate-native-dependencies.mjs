import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const nativePackages = {
  "darwin-arm64": ["@napi-rs/keyring-darwin-arm64", "keyring.darwin-arm64.node"],
  "darwin-x64": ["@napi-rs/keyring-darwin-x64", "keyring.darwin-x64.node"],
  "win32-x64": ["@napi-rs/keyring-win32-x64-msvc", "keyring.win32-x64-msvc.node"],
};
const currentTarget = `${process.platform}-${process.arch}`;
const nativeTarget = nativePackages[currentTarget];
if (!nativeTarget) {
  throw new Error(`Plataforma nativa ainda não suportada pela distribuição: ${currentTarget}.`);
}
const [nativePackage, bindingName] = nativeTarget;
const packageJsonPath = require.resolve(`${nativePackage}/package.json`);
const bindingPath = path.join(path.dirname(packageJsonPath), bindingName);

if (!existsSync(bindingPath)) {
  throw new Error(
    `Dependência nativa obrigatória ausente: ${nativePackage}. A release seria incapaz de iniciar a API local.`,
  );
}

console.log(`Dependência nativa ${currentTarget} validada: ${bindingPath}`);

