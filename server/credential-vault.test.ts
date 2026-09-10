import assert from "node:assert/strict";
import test from "node:test";
import {
  createCredentialVault,
  parseCredentialVault,
  STATE_PREFIX,
  SERVICE_NAME,
  PREVIOUS_SERVICE_NAME,
  LEGACY_VAULT_ACCOUNT,
  type KeyringEntry,
  type KeyringEntryFactory,
} from "./credential-vault-core";

interface FakeKeyringStore {
  entries: Map<string, string>;
  getCalls: Array<{ service: string; account: string }>;
  setCalls: Array<{ service: string; account: string; value: string }>;
  deleteCalls: Array<{ service: string; account: string }>;
  simulateGetError?: (service: string, account: string) => Error | undefined;
  simulateSetError?: (service: string, account: string, value: string) => Error | undefined;
  simulateDeleteError?: (service: string, account: string) => Error | undefined;
  confirmMismatchOnSet?: boolean;
}

function keyFor(service: string, account: string) {
  return `${service}:::${account}`;
}

function createFakeKeyring(initial: Record<string, string> = {}) {
  const store: FakeKeyringStore = {
    entries: new Map(Object.entries(initial)),
    getCalls: [],
    setCalls: [],
    deleteCalls: [],
  };

  const factory: KeyringEntryFactory = (service: string, account: string): KeyringEntry => {
    return {
      async getPassword(): Promise<string | null> {
        store.getCalls.push({ service, account });
        if (store.simulateGetError) {
          const err = store.simulateGetError(service, account);
          if (err) throw err;
        }
        const k = keyFor(service, account);
        return store.entries.has(k) ? store.entries.get(k)! : null;
      },
      async setPassword(password: string): Promise<void> {
        store.setCalls.push({ service, account, value: password });
        if (store.simulateSetError) {
          const err = store.simulateSetError(service, account, password);
          if (err) throw err;
        }
        const k = keyFor(service, account);
        if (store.confirmMismatchOnSet && !account.startsWith(STATE_PREFIX)) {
          store.entries.set(k, "valor-adulterado-para-falha-confirmacao");
        } else {
          store.entries.set(k, password);
        }
      },
      async deleteCredential(): Promise<boolean> {
        store.deleteCalls.push({ service, account });
        if (store.simulateDeleteError) {
          const err = store.simulateDeleteError(service, account);
          if (err) throw err;
        }
        const k = keyFor(service, account);
        const existed = store.entries.has(k);
        store.entries.delete(k);
        return existed;
      },
    };
  };

  return { store, factory };
}

test("parseCredentialVault processa entradas válidas e rejeita corrupção", () => {
  assert.deepEqual(parseCredentialVault(null), {});
  assert.deepEqual(parseCredentialVault(""), {});
  assert.deepEqual(parseCredentialVault("   "), {});
  assert.deepEqual(
    parseCredentialVault(
      JSON.stringify({
        "plugin:com.test:KEY": "secret-1",
        ignorar: "invalido",
      }),
    ),
    { "plugin:com.test:KEY": "secret-1" },
  );

  assert.throws(
    () => parseCredentialVault("{ broken json"),
    /O cofre de credenciais possui um formato inválido\./,
  );
  assert.throws(
    () => parseCredentialVault(JSON.stringify(["array", "invalido"])),
    /O cofre de credenciais possui um formato inválido\./,
  );
  assert.throws(
    () => parseCredentialVault(JSON.stringify(12345)),
    /O cofre de credenciais possui um formato inválido\./,
  );
});

test("1. atual prevalece: quando existe no cofre atual, não consulta legado nem blob", async () => {
  const { store, factory } = createFakeKeyring({
    [keyFor(SERVICE_NAME, "plugin:com.exemplo:API_KEY")]: "segredo-atual",
    [keyFor(PREVIOUS_SERVICE_NAME, "plugin:com.exemplo:API_KEY")]: "segredo-individual-antigo",
    [keyFor(PREVIOUS_SERVICE_NAME, LEGACY_VAULT_ACCOUNT)]: JSON.stringify({
      "plugin:com.exemplo:API_KEY": "segredo-blob-antigo",
    }),
  });
  const vault = createCredentialVault(factory);
  const secret = await vault.getPluginSecret("com.exemplo", "API_KEY");

  assert.equal(secret, "segredo-atual");
  // O legado individual não foi deletado
  assert.equal(
    store.entries.get(keyFor(PREVIOUS_SERVICE_NAME, "plugin:com.exemplo:API_KEY")),
    "segredo-individual-antigo",
  );
  // O blob legado não foi lido
  const blobRead = store.getCalls.some((c) => c.account === LEGACY_VAULT_ACCOUNT);
  assert.equal(blobRead, false);
  // Nenhuma escrita ocorreu
  assert.equal(store.setCalls.length, 0);
});

test("2. legado individual prevalece sobre blob: migra para atual e remove individual", async () => {
  const rawBlob = JSON.stringify({
    "plugin:com.exemplo:API_KEY": "segredo-blob-antigo",
  });
  const { store, factory } = createFakeKeyring({
    [keyFor(PREVIOUS_SERVICE_NAME, "plugin:com.exemplo:API_KEY")]: "segredo-individual-antigo",
    [keyFor(PREVIOUS_SERVICE_NAME, LEGACY_VAULT_ACCOUNT)]: rawBlob,
  });
  const vault = createCredentialVault(factory);
  const secret = await vault.getPluginSecret("com.exemplo", "API_KEY");

  assert.equal(secret, "segredo-individual-antigo");
  // Migrado para o cofre atual com confirmação
  assert.equal(
    store.entries.get(keyFor(SERVICE_NAME, "plugin:com.exemplo:API_KEY")),
    "segredo-individual-antigo",
  );
  // Deletado do legado individual
  assert.equal(
    store.entries.has(keyFor(PREVIOUS_SERVICE_NAME, "plugin:com.exemplo:API_KEY")),
    false,
  );
  // Blob legado permaneceu intacto e sequer foi consultado
  assert.equal(store.entries.get(keyFor(PREVIOUS_SERVICE_NAME, LEGACY_VAULT_ACCOUNT)), rawBlob);
  const blobRead = store.getCalls.some((c) => c.account === LEGACY_VAULT_ACCOUNT);
  assert.equal(blobRead, false);
});

test("3. fallback do blob válido: copia para atual com confirmação e preserva blob intacto", async () => {
  const blobData = {
    "plugin:com.exemplo:API_KEY": "segredo-do-blob",
    "plugin:outro.plugin:TOKEN": "segredo-outro",
  };
  const rawBlob = JSON.stringify(blobData);
  const { store, factory } = createFakeKeyring({
    [keyFor(PREVIOUS_SERVICE_NAME, LEGACY_VAULT_ACCOUNT)]: rawBlob,
  });
  const vault = createCredentialVault(factory);
  const secret = await vault.getPluginSecret("com.exemplo", "API_KEY");

  assert.equal(secret, "segredo-do-blob");
  // Copiado e confirmado no cofre atual
  assert.equal(
    store.entries.get(keyFor(SERVICE_NAME, "plugin:com.exemplo:API_KEY")),
    "segredo-do-blob",
  );
  // Blob legado NÃO foi alterado nem deletado
  assert.equal(store.entries.get(keyFor(PREVIOUS_SERVICE_NAME, LEGACY_VAULT_ACCOUNT)), rawBlob);
  // Confirmação de escrita registrada
  assert.equal(store.setCalls.length, 3);
  assert.equal(store.setCalls[1].service, SERVICE_NAME);
  assert.equal(store.setCalls[1].account, "plugin:com.exemplo:API_KEY");
  assert.equal(store.setCalls[1].value, "segredo-do-blob");
});

test("4. ausência: chave inexistente em atual, anterior e blob retorna undefined", async () => {
  const { store, factory } = createFakeKeyring({
    [keyFor(PREVIOUS_SERVICE_NAME, LEGACY_VAULT_ACCOUNT)]: JSON.stringify({
      "plugin:outro.plugin:TOKEN": "segredo-outro",
    }),
  });
  const vault = createCredentialVault(factory);
  const secret = await vault.getPluginSecret("com.exemplo", "CHAVE_INEXISTENTE");

  assert.equal(secret, undefined);
  assert.equal(store.setCalls.length, 0);
});

test("4. ausência: quando conta do blob legado sequer existe no cofre anterior", async () => {
  const { store, factory } = createFakeKeyring({});
  const vault = createCredentialVault(factory);
  const secret = await vault.getPluginSecret("com.exemplo", "CHAVE");

  assert.equal(secret, undefined);
  assert.equal(store.setCalls.length, 0);
});

test("5. blob inválido: JSON corrompido lança erro sem engolir como ausência", async () => {
  const { store, factory } = createFakeKeyring({
    [keyFor(PREVIOUS_SERVICE_NAME, LEGACY_VAULT_ACCOUNT)]: "{ json corrompido sem fechar",
  });
  const vault = createCredentialVault(factory);
  await assert.rejects(
    async () => vault.getPluginSecret("com.exemplo", "API_KEY"),
    /O cofre de credenciais possui um formato inválido\./,
  );
  // Nenhuma escrita em current
  assert.equal(store.entries.has(keyFor(SERVICE_NAME, "plugin:com.exemplo:API_KEY")), false);
});

test("5. blob inválido: tipo não-objeto lança erro sem engolir como ausência", async () => {
  const { store, factory } = createFakeKeyring({
    [keyFor(PREVIOUS_SERVICE_NAME, LEGACY_VAULT_ACCOUNT)]: JSON.stringify([1, 2, 3]),
  });
  const vault = createCredentialVault(factory);
  await assert.rejects(
    async () => vault.getPluginSecret("com.exemplo", "API_KEY"),
    /O cofre de credenciais possui um formato inválido\./,
  );
  assert.equal(store.entries.has(keyFor(SERVICE_NAME, "plugin:com.exemplo:API_KEY")), false);
});

test("6. erro de escrita/confirmação preserva origem: falha em migração individual preserva anterior", async () => {
  const { store, factory } = createFakeKeyring({
    [keyFor(PREVIOUS_SERVICE_NAME, "plugin:com.exemplo:API_KEY")]: "segredo-individual",
  });
  store.simulateSetError = (service) => {
    if (service === SERVICE_NAME) {
      return new Error("Falha de I/O de escrita");
    }
  };
  const vault = createCredentialVault(factory);
  await assert.rejects(
    async () => vault.getPluginSecret("com.exemplo", "API_KEY"),
    /Falha de I\/O de escrita/,
  );
  // Entrada anterior NÃO foi deletada
  assert.equal(
    store.entries.get(keyFor(PREVIOUS_SERVICE_NAME, "plugin:com.exemplo:API_KEY")),
    "segredo-individual",
  );
  assert.equal(store.deleteCalls.length, 0);
});

test("6. erro de escrita/confirmação preserva origem: confirmação divergente em individual preserva anterior", async () => {
  const { store, factory } = createFakeKeyring({
    [keyFor(PREVIOUS_SERVICE_NAME, "plugin:com.exemplo:API_KEY")]: "segredo-individual",
  });
  store.confirmMismatchOnSet = true;
  const vault = createCredentialVault(factory);
  await assert.rejects(
    async () => vault.getPluginSecret("com.exemplo", "API_KEY"),
    /A credencial migrada não pôde ser validada no cofre atual\./,
  );
  // Entrada anterior NÃO foi deletada
  assert.equal(
    store.entries.get(keyFor(PREVIOUS_SERVICE_NAME, "plugin:com.exemplo:API_KEY")),
    "segredo-individual",
  );
  assert.equal(store.deleteCalls.length, 0);
});

test("6. erro de escrita/confirmação preserva origem: falha ao migrar blob preserva blob intacto", async () => {
  const rawBlob = JSON.stringify({ "plugin:com.exemplo:API_KEY": "segredo-blob" });
  const { store, factory } = createFakeKeyring({
    [keyFor(PREVIOUS_SERVICE_NAME, LEGACY_VAULT_ACCOUNT)]: rawBlob,
  });
  store.confirmMismatchOnSet = true;
  const vault = createCredentialVault(factory);
  await assert.rejects(
    async () => vault.getPluginSecret("com.exemplo", "API_KEY"),
    /A credencial migrada não pôde ser validada no cofre atual\./,
  );
  // Blob preservado exatamente igual
  assert.equal(store.entries.get(keyFor(PREVIOUS_SERVICE_NAME, LEGACY_VAULT_ACCOUNT)), rawBlob);
});

test("7. segunda leitura sem regravação (idempotência)", async () => {
  const rawBlob = JSON.stringify({ "plugin:com.exemplo:API_KEY": "segredo-blob" });
  const { store, factory } = createFakeKeyring({
    [keyFor(PREVIOUS_SERVICE_NAME, LEGACY_VAULT_ACCOUNT)]: rawBlob,
  });
  const vault = createCredentialVault(factory);

  // Leitura 1: migra do blob para o atual
  const first = await vault.getPluginSecret("com.exemplo", "API_KEY");
  assert.equal(first, "segredo-blob");
  const setCallsCount = store.setCalls.length;
  assert.equal(setCallsCount, 3);

  // Leitura 2: deve retornar de current sem reescrever
  const second = await vault.getPluginSecret("com.exemplo", "API_KEY");
  assert.equal(second, "segredo-blob");
  assert.equal(store.setCalls.length, setCallsCount);
});

test("8. isolamento: só lê a chave exata do plugin no blob", async () => {
  const { factory } = createFakeKeyring({
    [keyFor(PREVIOUS_SERVICE_NAME, LEGACY_VAULT_ACCOUNT)]: JSON.stringify({
      "plugin:com.plugin-a:API_KEY": "segredo-a",
    }),
  });
  const vault = createCredentialVault(factory);

  // Plugin B não deve ler o segredo do Plugin A
  const secretB = await vault.getPluginSecret("com.plugin-b", "API_KEY");
  assert.equal(secretB, undefined);
});

test("8. isolamento: conexão nunca herda credencial global por inferência", async () => {
  const { store, factory } = createFakeKeyring({
    [keyFor(SERVICE_NAME, "plugin:com.exemplo:API_KEY")]: "segredo-global-atual",
    [keyFor(PREVIOUS_SERVICE_NAME, LEGACY_VAULT_ACCOUNT)]: JSON.stringify({
      "plugin:com.exemplo:API_KEY": "segredo-global-blob",
    }),
  });
  const vault = createCredentialVault(factory);

  // Consulta por conexão específica não deve inferir do segredo global
  const connSecret = await vault.getPluginConnectionSecret("com.exemplo", "conn-1", "API_KEY");
  assert.equal(connSecret, undefined);

  // O blob legado sequer foi lido
  const blobRead = store.getCalls.some((c) => c.account === LEGACY_VAULT_ACCOUNT);
  assert.equal(blobRead, false);
});

test("negação de acesso do cofre não é engolida como ausência", async () => {
  const { store, factory } = createFakeKeyring();
  store.simulateGetError = (service) => {
    if (service === SERVICE_NAME) {
      return new Error("Acesso negado pela política de segurança do sistema operacional");
    }
  };
  const vault = createCredentialVault(factory);
  await assert.rejects(
    async () => vault.getPluginSecret("com.exemplo", "API_KEY"),
    /Acesso negado pela política de segurança do sistema operacional/,
  );
});

const plugin = "com.global";
const account = "plugin:com.global:TOKEN";
const currentKey = keyFor(SERVICE_NAME, account);
const markerKey = keyFor(SERVICE_NAME, STATE_PREFIX + account);
const blobKey = keyFor(PREVIOUS_SERVICE_NAME, LEGACY_VAULT_ACCOUNT);
const fixture = () =>
  createFakeKeyring({ [blobKey]: JSON.stringify({ [account]: "legacy-fixture" }) });

test("exclusão permanece após nova leitura e nova instância; blob intacto", async () => {
  const { store, factory } = fixture();
  const blob = store.entries.get(blobKey);
  const vault = createCredentialVault(factory);
  assert.equal(await vault.getPluginSecret(plugin, "TOKEN"), "legacy-fixture");
  assert.equal(await vault.deletePluginSecret(plugin, "TOKEN"), true);
  assert.equal(store.entries.has(currentKey), false);
  assert.equal(await vault.getPluginSecret(plugin, "TOKEN"), undefined);
  assert.equal(await createCredentialVault(factory).getPluginSecret(plugin, "TOKEN"), undefined);
  assert.equal(store.entries.get(blobKey), blob);
  assert.equal(store.entries.get(markerKey), "deleted");
  assert.equal(await vault.deletePluginSecret(plugin, "TOKEN"), false);
});

test("excluir antes da primeira migração impede importação futura", async () => {
  const { store, factory } = fixture();
  await createCredentialVault(factory).deletePluginSecret(plugin, "TOKEN");
  assert.equal(await createCredentialVault(factory).getPluginSecret(plugin, "TOKEN"), undefined);
  assert.equal(
    store.getCalls.some((c) => c.account === LEGACY_VAULT_ACCOUNT),
    false,
  );
});

test("substituir e excluir não restaura segredo antigo; recadastro explícito funciona", async () => {
  const { store, factory } = fixture();
  const vault = createCredentialVault(factory);
  await vault.setPluginSecret(plugin, "TOKEN", "replacement-fixture");
  await vault.deletePluginSecret(plugin, "TOKEN");
  assert.equal(await vault.getPluginSecret(plugin, "TOKEN"), undefined);
  await vault.setPluginSecret(plugin, "TOKEN", "new-fixture");
  assert.equal(
    await createCredentialVault(factory).getPluginSecret(plugin, "TOKEN"),
    "new-fixture",
  );
  store.entries.delete(currentKey);
  assert.equal(
    await vault.getPluginSecret(plugin, "TOKEN"),
    undefined,
    "active must never fall back to legacy",
  );
});

test("falha ao persistir revogação aborta antes de apagar valores", async () => {
  const { store, factory } = fixture();
  store.entries.set(currentKey, "current-fixture");
  store.simulateSetError = (_s, a) =>
    a.startsWith(STATE_PREFIX) ? new Error("marker-write-failed") : undefined;
  await assert.rejects(
    createCredentialVault(factory).deletePluginSecret(plugin, "TOKEN"),
    /marker-write-failed/,
  );
  assert.equal(store.entries.get(currentKey), "current-fixture");
  assert.equal(store.deleteCalls.length, 0);
});

test("falha de remoção física mantém revogação após reinício", async () => {
  const { store, factory } = fixture();
  store.entries.set(currentKey, "current-fixture");
  store.simulateDeleteError = () => new Error("delete-failed");
  await assert.rejects(
    createCredentialVault(factory).deletePluginSecret(plugin, "TOKEN"),
    /delete-failed/,
  );
  assert.equal(await createCredentialVault(factory).getPluginSecret(plugin, "TOKEN"), undefined);
  assert.equal(store.entries.get(currentKey), "current-fixture");
});

test("confirmação divergente não permite ler valor adulterado posteriormente", async () => {
  const { store, factory } = fixture();
  store.confirmMismatchOnSet = true;
  await assert.rejects(createCredentialVault(factory).getPluginSecret(plugin, "TOKEN"), /validada/);
  assert.equal(store.entries.get(markerKey), "pending");
  await assert.rejects(createCredentialVault(factory).getPluginSecret(plugin, "TOKEN"), /pendente/);
  store.confirmMismatchOnSet = false;
  await createCredentialVault(factory).setPluginSecret(plugin, "TOKEN", "recovered-fixture");
  assert.equal(
    await createCredentialVault(factory).getPluginSecret(plugin, "TOKEN"),
    "recovered-fixture",
  );
});

test("marcador inválido bloqueia fallback sem consultar segredos", async () => {
  const { store, factory } = fixture();
  store.entries.set(markerKey, "unknown-state");
  await assert.rejects(
    createCredentialVault(factory).getPluginSecret(plugin, "TOKEN"),
    /Estado de credencial inválido/,
  );
  assert.equal(store.getCalls.length, 1);
});

test("migração e exclusão concorrentes são serializadas entre instâncias", async () => {
  const { factory } = fixture();
  const first = createCredentialVault(factory);
  const second = createCredentialVault(factory);
  const results = await Promise.all([
    first.getPluginSecret(plugin, "TOKEN"),
    second.deletePluginSecret(plugin, "TOKEN"),
    first.getPluginSecret(plugin, "TOKEN"),
  ]);
  assert.deepEqual(results, ["legacy-fixture", true, undefined]);
});

test("excluir um plugin não revoga outro nem uma conexão", async () => {
  const { factory } = fixture();
  const vault = createCredentialVault(factory);
  await vault.setPluginSecret("com.other", "TOKEN", "other-fixture");
  await vault.setPluginConnectionSecret(plugin, "connection-1", "TOKEN", "connection-fixture");
  await vault.deletePluginSecret(plugin, "TOKEN");
  assert.equal(await vault.getPluginSecret("com.other", "TOKEN"), "other-fixture");
  assert.equal(
    await vault.getPluginConnectionSecret(plugin, "connection-1", "TOKEN"),
    "connection-fixture",
  );
  await vault.deletePluginConnectionSecret(plugin, "connection-1", "TOKEN");
  assert.equal(
    await createCredentialVault(factory).getPluginConnectionSecret(plugin, "connection-1", "TOKEN"),
    undefined,
  );
});

test("validação de identificadores e valor vazio não acessa o cofre", async () => {
  const { store, factory } = fixture();
  const vault = createCredentialVault(factory);
  assert.throws(() => vault.getPluginSecret("../invalid", "TOKEN"), /inválido/);
  await assert.rejects(vault.setPluginSecret(plugin, "TOKEN", " "), /vazia/);
  assert.equal(store.getCalls.length + store.setCalls.length + store.deleteCalls.length, 0);
});

test("remoção física sem efeito não é reportada como sucesso", async () => {
  const { store, factory } = fixture();
  store.entries.set(currentKey, "current-fixture");
  const noDelete: KeyringEntryFactory = (s, a) => ({
    ...factory(s, a),
    async deleteCredential() {
      return false;
    },
  });
  await assert.rejects(
    createCredentialVault(noDelete).deletePluginSecret(plugin, "TOKEN"),
    /não confirmada/,
  );
  assert.equal(await createCredentialVault(noDelete).getPluginSecret(plugin, "TOKEN"), undefined);
});

test("falha na confirmação final mantém operação pendente", async () => {
  const { store, factory } = fixture();
  store.simulateSetError = (_s, a, v) =>
    a.startsWith(STATE_PREFIX) && v === "active" ? new Error("activation-failed") : undefined;
  await assert.rejects(
    createCredentialVault(factory).getPluginSecret(plugin, "TOKEN"),
    /activation-failed/,
  );
  assert.equal(store.entries.get(markerKey), "pending");
  await assert.rejects(createCredentialVault(factory).getPluginSecret(plugin, "TOKEN"), /pendente/);
  assert.ok(store.entries.has(blobKey));
});

test("set e delete concorrentes respeitam a ordem solicitada", async () => {
  const { factory } = fixture();
  const vault = createCredentialVault(factory);
  await Promise.all([
    vault.setPluginSecret(plugin, "TOKEN", "replacement-fixture"),
    createCredentialVault(factory).deletePluginSecret(plugin, "TOKEN"),
  ]);
  assert.equal(await vault.getPluginSecret(plugin, "TOKEN"), undefined);
});

test("conexão migra somente sua entrada individual e permanece revogada", async () => {
  const { store, factory } = fixture();
  const connection = "plugin:com.global:connection:connection-1:TOKEN";
  store.entries.set(keyFor(PREVIOUS_SERVICE_NAME, connection), "connection-fixture");
  const vault = createCredentialVault(factory);
  assert.equal(
    await vault.getPluginConnectionSecret(plugin, "connection-1", "TOKEN"),
    "connection-fixture",
  );
  await vault.deletePluginConnectionSecret(plugin, "connection-1", "TOKEN");
  assert.equal(
    await createCredentialVault(factory).getPluginConnectionSecret(plugin, "connection-1", "TOKEN"),
    undefined,
  );
  assert.equal(
    store.getCalls.some((c) => c.account === LEGACY_VAULT_ACCOUNT),
    false,
  );
});
