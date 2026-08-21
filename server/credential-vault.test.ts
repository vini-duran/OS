import assert from "node:assert/strict";
import test from "node:test";
import { parseCredentialVault } from "./credential-vault";

test("inicializa um cofre novo sem credenciais", () => {
  assert.deepEqual(parseCredentialVault(undefined), {});
});

test("mantém somente credenciais válidas no registro único", () => {
  assert.deepEqual(
    parseCredentialVault(
      JSON.stringify({
        "plugin:example.plugin:API_KEY": "secret",
        metadata: "ignored",
        "plugin:example.plugin:EMPTY": "",
      }),
    ),
    { "plugin:example.plugin:API_KEY": "secret" },
  );
});

test("rejeita um cofre corrompido sem sobrescrever seu conteúdo", () => {
  assert.throws(() => parseCredentialVault("[]"), /formato inválido/);
  assert.throws(() => parseCredentialVault("not-json"));
});
