// Explicit opt-in native test. Never uses production service names.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AsyncEntry } from "@napi-rs/keyring";
import {
  createCredentialVault,
  PREVIOUS_SERVICE_NAME,
  LEGACY_VAULT_ACCOUNT,
} from "../server/credential-vault-core";

const child = process.argv[2] === "--verify-deleted";
const prefix = child ? process.argv[3] : "ContentFlow-Isolated-Test-" + randomUUID();
assert.match(prefix, /^ContentFlow-Isolated-Test-[0-9a-f-]{36}$/);
const entries = new Map<string, AsyncEntry>();
const factory = (service: string, account: string) => {
  const key = service + "::" + account;
  let entry = entries.get(key);
  if (!entry) {
    entry = new AsyncEntry(prefix + ":" + service, account);
    entries.set(key, entry);
  }
  return entry;
};
const vault = createCredentialVault(factory);
if (child) {
  assert.equal(await vault.getPluginSecret("com.test", "TOKEN"), undefined);
  console.log("fresh_process_revocation: PASS");
} else {
  try {
    const legacy = factory(PREVIOUS_SERVICE_NAME, LEGACY_VAULT_ACCOUNT);
    assert.ok((await legacy.getPassword()) == null);
    const blob = JSON.stringify({ "plugin:com.test:TOKEN": "synthetic-not-a-real-token" });
    await legacy.setPassword(blob);
    assert.equal(await vault.getPluginSecret("com.test", "TOKEN"), "synthetic-not-a-real-token");
    assert.equal(await vault.deletePluginSecret("com.test", "TOKEN"), true);
    execFileSync(
      process.execPath,
      ["--import", "tsx", fileURLToPath(import.meta.url), "--verify-deleted", prefix],
      {
        stdio: "pipe",
        timeout: 30000,
      },
    );
    assert.equal(await legacy.getPassword(), blob);
    await vault.setPluginConnectionSecret(
      "com.test",
      "test-connection",
      "TOKEN",
      "synthetic-connection",
    );
    assert.equal(
      await vault.getPluginConnectionSecret("com.test", "test-connection", "TOKEN"),
      "synthetic-connection",
    );
    await vault.deletePluginConnectionSecret("com.test", "test-connection", "TOKEN");
    assert.equal(
      await vault.getPluginConnectionSecret("com.test", "test-connection", "TOKEN"),
      undefined,
    );
    console.log("native_migration_revocation_restart_connection: PASS");
  } finally {
    // Only random, test-owned service entries are eligible for cleanup.
    for (const entry of entries.values()) await entry.deleteCredential();
    for (const entry of entries.values()) assert.ok((await entry.getPassword()) == null);
    console.log("synthetic_entries_removed: PASS");
  }
}
