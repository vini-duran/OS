import { AsyncEntry } from "@napi-rs/keyring";

const SERVICE_NAME = "ContentFlow OS";
const VAULT_ACCOUNT = "plugin-vault-v2";
type CredentialVault = Record<string, string>;

const vaultEntry = new AsyncEntry(SERVICE_NAME, VAULT_ACCOUNT);
let cachedVault: CredentialVault | undefined;
let loadingVault: Promise<CredentialVault> | undefined;
let writeQueue: Promise<void> = Promise.resolve();

function credentialName(pluginId: string, secretKey: string) {
  if (!/^[a-z0-9.-]+$/.test(pluginId) || !/^[A-Z0-9_]+$/.test(secretKey)) {
    throw new Error("Identificador de credencial inválido.");
  }
  return `plugin:${pluginId}:${secretKey}`;
}

export function parseCredentialVault(serialized: string | null | undefined): CredentialVault {
  if (!serialized) return {};
  const parsed: unknown = JSON.parse(serialized);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("O cofre de credenciais possui um formato inválido.");
  }
  const vault: CredentialVault = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith("plugin:") && typeof value === "string" && value) vault[key] = value;
  }
  return vault;
}

async function loadVault() {
  if (cachedVault) return cachedVault;
  if (!loadingVault) {
    loadingVault = vaultEntry.getPassword().then((serialized) => {
      cachedVault = parseCredentialVault(serialized);
      return cachedVault;
    });
  }
  return loadingVault;
}

function updateVault(change: (vault: CredentialVault) => boolean) {
  const operation = writeQueue.then(async () => {
    const current = await loadVault();
    const next = { ...current };
    if (!change(next)) return;
    await vaultEntry.setPassword(JSON.stringify(next));
    cachedVault = next;
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}

export async function setPluginSecret(pluginId: string, secretKey: string, value: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error("A credencial não pode ser vazia.");
  const name = credentialName(pluginId, secretKey);
  await updateVault((vault) => {
    vault[name] = normalized;
    return true;
  });
}

export async function getPluginSecret(pluginId: string, secretKey: string) {
  return (await loadVault())[credentialName(pluginId, secretKey)];
}

export async function deletePluginSecret(pluginId: string, secretKey: string) {
  const name = credentialName(pluginId, secretKey);
  let deleted = false;
  await updateVault((vault) => {
    if (!(name in vault)) return false;
    delete vault[name];
    deleted = true;
    return true;
  });
  return deleted;
}

export function credentialStoreName() {
  if (process.platform === "win32") return "Windows Credential Manager";
  if (process.platform === "darwin") return "macOS Keychain";
  return "Secret Service do sistema";
}
