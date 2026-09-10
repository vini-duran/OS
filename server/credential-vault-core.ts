export interface KeyringEntry {
  getPassword(): Promise<string | null | undefined>;
  setPassword(password: string): Promise<void>;
  deleteCredential(): Promise<boolean>;
}

export type KeyringEntryFactory = (service: string, account: string) => KeyringEntry;

export const SERVICE_NAME = "ContentFlow";
export const PREVIOUS_SERVICE_NAME = [SERVICE_NAME, String.fromCharCode(79, 83)].join(" ");
export const LEGACY_VAULT_ACCOUNT = "plugin-vault-v2";

export function accountName(pluginId: string, secretKey: string) {
  if (!/^[a-z0-9.-]+$/.test(pluginId) || !/^[A-Z0-9_]+$/.test(secretKey)) {
    throw new Error("Identificador de credencial inválido.");
  }
  return `plugin:${pluginId}:${secretKey}`;
}

export function connectionAccountName(pluginId: string, connectionId: string, secretKey: string) {
  if (
    !/^[a-z0-9.-]+$/.test(pluginId) ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(connectionId) ||
    !/^[A-Z0-9_]+$/.test(secretKey)
  ) {
    throw new Error("Identificador de conexão inválido.");
  }
  return `plugin:${pluginId}:connection:${connectionId}:${secretKey}`;
}

export function parseCredentialVault(
  serialized: string | null | undefined,
): Record<string, string> {
  if (!serialized?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("O cofre de credenciais possui um formato inválido.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("O cofre de credenciais possui um formato inválido.");
  }
  const vault: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith("plugin:") && typeof value === "string" && value) {
      vault[key] = value;
    }
  }
  return vault;
}

export const STATE_PREFIX = "credential-state-v1:";
const queues = new WeakMap<KeyringEntryFactory, Map<string, Promise<void>>>();

export class CredentialVault {
  private readonly entryFactory: KeyringEntryFactory;
  constructor(factory: KeyringEntryFactory) {
    this.entryFactory = factory;
  }
  private serial<T>(account: string, operation: () => Promise<T>): Promise<T> {
    let queue = queues.get(this.entryFactory);
    if (!queue) {
      queue = new Map();
      queues.set(this.entryFactory, queue);
    }
    const result = (queue.get(account) ?? Promise.resolve()).then(operation);
    const settled = result.then(
      () => {},
      () => {},
    );
    queue.set(account, settled);
    void settled.then(() => {
      if (queue.get(account) === settled) queue.delete(account);
    });
    return result;
  }
  private entry(account: string, service = SERVICE_NAME) {
    return this.entryFactory(service, account);
  }
  private async state(account: string) {
    const value = await this.entry(STATE_PREFIX + account).getPassword();
    if (value == null || value === "active" || value === "pending" || value === "deleted")
      return value;
    throw new Error("Estado de credencial inválido; recuperação explícita necessária.");
  }
  private async writeVerified(account: string, value: string) {
    const entry = this.entry(account);
    await entry.setPassword(value);
    if ((await entry.getPassword()) !== value) {
      throw new Error("A credencial migrada não pôde ser validada no cofre atual.");
    }
  }
  private async replace(account: string, value: string) {
    await this.writeVerified(STATE_PREFIX + account, "pending");
    await this.writeVerified(account, value);
    await this.writeVerified(STATE_PREFIX + account, "active");
  }
  private async read(account: string, allowBlob: boolean): Promise<string | undefined> {
    const state = await this.state(account);
    if (state === "deleted") return undefined;
    if (state === "pending")
      throw new Error(
        "Operação de credencial pendente; cadastre novamente ou exclua explicitamente.",
      );
    const current = await this.entry(account).getPassword();
    if (current || state === "active") return current || undefined;
    const previous = this.entry(account, PREVIOUS_SERVICE_NAME);
    const old = await previous.getPassword();
    if (old) {
      await this.replace(account, old);
      await previous.deleteCredential();
      return old;
    }
    if (!allowBlob) return undefined;
    const blob = await this.entry(LEGACY_VAULT_ACCOUNT, PREVIOUS_SERVICE_NAME).getPassword();
    const value = parseCredentialVault(blob)[account];
    if (!value) return undefined;
    await this.replace(account, value);
    return value;
  }
  private async remove(account: string) {
    const wasDeleted = (await this.state(account)) === "deleted";
    // Persist revocation before touching values; never modify the legacy blob.
    await this.writeVerified(STATE_PREFIX + account, "deleted");
    let changed = !wasDeleted;
    for (const service of [SERVICE_NAME, PREVIOUS_SERVICE_NAME]) {
      const entry = this.entry(account, service);
      if (await entry.getPassword()) {
        await entry.deleteCredential();
        if (await entry.getPassword())
          throw new Error("Exclusão física não confirmada; acesso permanece revogado.");
        changed = true;
      }
    }
    return changed;
  }
  setPluginSecret(pluginId: string, secretKey: string, value: string) {
    const account = accountName(pluginId, secretKey);
    const normalized = value.trim();
    if (!normalized) return Promise.reject(new Error("A credencial não pode ser vazia."));
    return this.serial(account, () => this.replace(account, normalized));
  }
  getPluginSecret(pluginId: string, secretKey: string) {
    const account = accountName(pluginId, secretKey);
    return this.serial(account, () => this.read(account, true));
  }
  deletePluginSecret(pluginId: string, secretKey: string) {
    const account = accountName(pluginId, secretKey);
    return this.serial(account, () => this.remove(account));
  }
  setPluginConnectionSecret(
    pluginId: string,
    connectionId: string,
    secretKey: string,
    value: string,
  ) {
    const account = connectionAccountName(pluginId, connectionId, secretKey);
    const normalized = value.trim();
    if (!normalized) return Promise.reject(new Error("A credencial não pode ser vazia."));
    return this.serial(account, () => this.replace(account, normalized));
  }
  getPluginConnectionSecret(pluginId: string, connectionId: string, secretKey: string) {
    const account = connectionAccountName(pluginId, connectionId, secretKey);
    return this.serial(account, () => this.read(account, false));
  }
  deletePluginConnectionSecret(pluginId: string, connectionId: string, secretKey: string) {
    const account = connectionAccountName(pluginId, connectionId, secretKey);
    return this.serial(account, () => this.remove(account));
  }
}
export function createCredentialVault(factory: KeyringEntryFactory) {
  return new CredentialVault(factory);
}
