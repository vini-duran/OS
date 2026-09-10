import { AsyncEntry } from "@napi-rs/keyring";
import { createCredentialVault } from "./credential-vault-core";

// Only this adapter loads the native credential store; tests import the pure core.
const vault = createCredentialVault((service, account) => new AsyncEntry(service, account));
export const setPluginSecret = vault.setPluginSecret.bind(vault);
export const getPluginSecret = vault.getPluginSecret.bind(vault);
export const deletePluginSecret = vault.deletePluginSecret.bind(vault);
export const setPluginConnectionSecret = vault.setPluginConnectionSecret.bind(vault);
export const getPluginConnectionSecret = vault.getPluginConnectionSecret.bind(vault);
export const deletePluginConnectionSecret = vault.deletePluginConnectionSecret.bind(vault);

export function credentialStoreName() {
  if (process.platform === "win32") return "Windows Credential Manager";
  if (process.platform === "darwin") return "macOS Keychain";
  return "Secret Service do sistema";
}
