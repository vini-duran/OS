import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildCanonicalRecoveryPayload, CoreKeyStore, deriveCoreKeyId } from "./core-keystore";
import { validateExternalRecoverySnapshot } from "../../src/lib/plugin-contract";
import type {
  PluginExternalRecoverySnapshot,
  PluginRecoveryAuthorizationTarget,
} from "../../src/lib/domain";

test("CoreKeyStore: geração e persistência segura em diretório temporário isolado", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "core-keystore-test-"));
  try {
    const keyStore = new CoreKeyStore({ securityDirectory: tempDir });
    assert.ok(keyStore.keyId.startsWith("core_ed25519_"));
    assert.ok(keyStore.publicKeyPem.includes("BEGIN PUBLIC KEY"));

    const privPath = path.join(tempDir, "core_private_key.pem");
    const pubPath = path.join(tempDir, "core_public_key.pem");
    const metaPath = path.join(tempDir, "core_key_metadata.json");

    assert.ok(existsSync(privPath));
    assert.ok(existsSync(pubPath));
    assert.ok(existsSync(metaPath));

    // Permissões restritas em sistemas POSIX (0o600 para chave privada)
    if (process.platform !== "win32") {
      const mode = statSync(privPath).mode & 0o777;
      assert.equal(mode, 0o600, "Chave privada deve ser gravada com permissão restrita 0600");
    }

    // Reabertura no mesmo diretório: preserva identidade e mesmo keyId
    const reloaded = new CoreKeyStore({ securityDirectory: tempDir });
    assert.equal(reloaded.keyId, keyStore.keyId);
    assert.equal(reloaded.publicKeyPem, keyStore.publicKeyPem);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CoreKeyStore: assinatura Ed25519 e verificação válida com alvo externo completo", () => {
  const keyStore = new CoreKeyStore();
  const target: PluginRecoveryAuthorizationTarget = {
    executionId: "exec-100",
    blockId: "thumb-gen",
    attempt: 2,
    externalTarget: {
      system: "spanish_thumbnail_bridge",
      runId: "run_alpha",
      targetId: "layout_01",
      cycle: 1,
      snapshotRevision: "rev_abc123",
    },
  };

  const auth = keyStore.signRecoveryAuthorization({ target });

  assert.equal(auth.version, "1");
  assert.equal(auth.origin, "user_action");
  assert.equal(auth.algorithm, "ed25519");
  assert.equal(auth.keyId, keyStore.keyId);
  assert.deepEqual(auth.target, target);
  assert.ok(typeof auth.signature === "string" && auth.signature.length > 0);

  // Verificação deve ser bem-sucedida
  const valid = keyStore.verifyRecoveryAuthorization(auth);
  assert.equal(valid, true, "Assinatura gerada deve ser válida contra a chave do Core");
});

test("CoreKeyStore: detecção estrita de adulteração (tampering) em qualquer campo do alvo", () => {
  const keyStore = new CoreKeyStore();
  const target: PluginRecoveryAuthorizationTarget = {
    executionId: "exec-tamper",
    blockId: "block-tamper",
    attempt: 3,
    externalTarget: {
      system: "system-a",
      runId: "run-a",
      targetId: "layout_99",
      cycle: 2,
      snapshotRevision: "hash-original",
    },
  };

  const auth = keyStore.signRecoveryAuthorization({ target });
  assert.equal(keyStore.verifyRecoveryAuthorization(auth), true);

  // 1. Adulteração no attempt do Core
  const tamperedAttempt = structuredClone(auth);
  tamperedAttempt.target.attempt = 4;
  assert.equal(keyStore.verifyRecoveryAuthorization(tamperedAttempt), false);

  // 2. Adulteração no blockId do Core
  const tamperedBlock = structuredClone(auth);
  tamperedBlock.target.blockId = "block-other";
  assert.equal(keyStore.verifyRecoveryAuthorization(tamperedBlock), false);

  // 3. Adulteração no executionId do Core
  const tamperedExec = structuredClone(auth);
  tamperedExec.target.executionId = "exec-other";
  assert.equal(keyStore.verifyRecoveryAuthorization(tamperedExec), false);

  // 4. Adulteração no targetId externo
  const tamperedTargetId = structuredClone(auth);
  tamperedTargetId.target.externalTarget!.targetId = "layout_02";
  assert.equal(keyStore.verifyRecoveryAuthorization(tamperedTargetId), false);

  // 5. Adulteração no cycle externo
  const tamperedCycle = structuredClone(auth);
  tamperedCycle.target.externalTarget!.cycle = 3;
  assert.equal(keyStore.verifyRecoveryAuthorization(tamperedCycle), false);

  // 6. Adulteração no snapshotRevision
  const tamperedRev = structuredClone(auth);
  tamperedRev.target.externalTarget!.snapshotRevision = "hash-altered";
  assert.equal(keyStore.verifyRecoveryAuthorization(tamperedRev), false);

  // 7. Adulteração no keyId
  const tamperedKeyId = structuredClone(auth);
  tamperedKeyId.keyId = "core_ed25519_forged";
  assert.equal(keyStore.verifyRecoveryAuthorization(tamperedKeyId), false);

  // 8. Adulteração na assinatura
  const tamperedSig = structuredClone(auth);
  tamperedSig.signature = "aW52YWxpZHNpZ25hdHVyZQ==";
  assert.equal(keyStore.verifyRecoveryAuthorization(tamperedSig), false);

  // 9. Verificação com chave pública alheia (não correspondente)
  const anotherKeyStore = new CoreKeyStore();
  const validWithOther = keyStore.verifyRecoveryAuthorization(auth, anotherKeyStore.publicKeyPem);
  assert.equal(validWithOther, false, "Chave pública diferente deve reprovar assinatura");
});

test("CoreKeyStore: autorização sem externalTarget serializa ext:none de forma determinística", () => {
  const keyStore = new CoreKeyStore();
  const target: PluginRecoveryAuthorizationTarget = {
    executionId: "exec-internal",
    blockId: "block-internal",
    attempt: 1,
  };

  const canonical = buildCanonicalRecoveryPayload({
    keyId: keyStore.keyId,
    token: "tok-1",
    authorizedAt: "2026-09-09T00:00:00.000Z",
    origin: "user_action",
    target,
  });

  assert.ok(canonical.includes("ext:none"));

  const auth = keyStore.signRecoveryAuthorization({
    token: "tok-1",
    authorizedAt: "2026-09-09T00:00:00.000Z",
    target,
  });
  assert.equal(keyStore.verifyRecoveryAuthorization(auth), true);
});

test("CoreKeyStore: chave privada nunca é exportada ou vazada", () => {
  const keyStore = new CoreKeyStore();
  const pubInfo = keyStore.getPublicKeyInfo();

  assert.equal(pubInfo.keyId, keyStore.keyId);
  assert.equal(pubInfo.algorithm, "ed25519");
  assert.ok(pubInfo.publicKeyPem.includes("BEGIN PUBLIC KEY"));
  assert.ok(!pubInfo.publicKeyPem.includes("PRIVATE KEY"));

  const auth = keyStore.signRecoveryAuthorization({
    target: { executionId: "e", blockId: "b", attempt: 1 },
  });
  const serialized = JSON.stringify(auth);
  assert.ok(!serialized.includes("PRIVATE KEY"));
  assert.ok(!("privateKey" in auth));
});

test("validateExternalRecoverySnapshot: validação estrita do contrato genérico sem identidade Spanish", () => {
  const validData: PluginExternalRecoverySnapshot = {
    format: "contentflow-external-recovery-snapshot-v1",
    system: "generic_worker_bridge",
    runId: "run_456",
    targetId: "item_789",
    cycle: 1,
    snapshotRevision: "rev_332211",
    recordedAt: new Date().toISOString(),
    reason: "Queue paused after 3 failures",
    metadata: { itemsLeft: 5 },
  };

  const parsed = validateExternalRecoverySnapshot(validData);
  assert.ok(parsed);
  assert.equal(parsed.system, "generic_worker_bridge");
  assert.equal(parsed.runId, "run_456");
  assert.equal(parsed.targetId, "item_789");
  assert.equal(parsed.cycle, 1);
  assert.equal(parsed.snapshotRevision, "rev_332211");
  assert.equal(parsed.reason, "Queue paused after 3 failures");

  // Rejeições
  assert.equal(validateExternalRecoverySnapshot(null), undefined);
  assert.equal(validateExternalRecoverySnapshot("invalid"), undefined);
  assert.equal(
    validateExternalRecoverySnapshot({ ...validData, format: "wrong-format" }),
    undefined,
  );
  assert.equal(validateExternalRecoverySnapshot({ ...validData, system: "   " }), undefined);
  assert.equal(validateExternalRecoverySnapshot({ ...validData, cycle: -1 }), undefined);
  assert.equal(
    validateExternalRecoverySnapshot({ ...validData, recordedAt: "not-a-date" }),
    undefined,
  );
  assert.equal(validateExternalRecoverySnapshot({ ...validData, snapshotRevision: "" }), undefined);
});

test("CoreKeyStore: metadados divergentes lançam erro explícito e NÃO sobrescrevem arquivos", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "core-keystore-meta-"));
  try {
    const original = new CoreKeyStore({ securityDirectory: tempDir });
    const metaPath = path.join(tempDir, "core_key_metadata.json");
    const privPath = path.join(tempDir, "core_private_key.pem");
    const originalPrivPem = readFileSync(privPath, "utf8");

    // Adultera os metadados com um keyId divergente
    const corruptedMeta = {
      keyId: "core_ed25519_forged_divergent_id",
      algorithm: "ed25519",
      createdAt: new Date().toISOString(),
    };
    writeFileSync(metaPath, JSON.stringify(corruptedMeta, null, 2), "utf8");

    // Deve falhar explicitamente sem regenerar a chave nem sobrescrever arquivos
    assert.throws(
      () => new CoreKeyStore({ securityDirectory: tempDir }),
      /Inconsistência na keystore do Core: keyId nos metadados.*diverge/,
    );

    // O arquivo de chave privada deve permanecer intacto (não foi regenerado)
    assert.equal(readFileSync(privPath, "utf8"), originalPrivPem);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CoreKeyStore: material PEM corrompido lança erro explícito e NÃO regenera arquivos", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "core-keystore-corrupt-"));
  try {
    new CoreKeyStore({ securityDirectory: tempDir });
    const privPath = path.join(tempDir, "core_private_key.pem");

    // Corrompe o arquivo PEM da chave privada
    writeFileSync(privPath, "--- CORRUPTED NOT A VALID PEM ---", "utf8");

    // Deve lançar erro explícito
    assert.throws(
      () => new CoreKeyStore({ securityDirectory: tempDir }),
      /Inconsistência na keystore do Core: material PEM corrompido ou inválido/,
    );

    // O arquivo não deve ter sido substituído por uma chave nova
    assert.equal(readFileSync(privPath, "utf8"), "--- CORRUPTED NOT A VALID PEM ---");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CoreKeyStore: arquivos parciais de chave lançam erro explícito", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "core-keystore-partial-"));
  try {
    new CoreKeyStore({ securityDirectory: tempDir });
    const pubPath = path.join(tempDir, "core_public_key.pem");
    rmSync(pubPath);

    assert.throws(
      () => new CoreKeyStore({ securityDirectory: tempDir }),
      /Inconsistência na keystore do Core: arquivos de chave incompletos/,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CoreKeyStore: na verificação, exige correspondência estrita entre keyId e a chave pública confiável", () => {
  const keyStoreA = new CoreKeyStore();
  const keyStoreB = new CoreKeyStore();

  const target: PluginRecoveryAuthorizationTarget = {
    executionId: "exec-match",
    blockId: "block-match",
    attempt: 1,
    externalTarget: {
      system: "system-test",
      runId: "run-test",
      targetId: "layout_01",
      cycle: 1,
      snapshotRevision: "rev-1",
    },
  };

  // Autorização assinada pela chave A
  const authA = keyStoreA.signRecoveryAuthorization({ target });

  // 1. Verificação contra a própria chave pública A: sucesso
  assert.equal(keyStoreA.verifyRecoveryAuthorization(authA), true);
  assert.equal(keyStoreA.verifyRecoveryAuthorization(authA, keyStoreA.publicKeyPem), true);

  // 2. Verificação contra chave pública B confiável: keyId de authA (da chave A)
  // diverge do keyId derivado da chave pública B -> retorna false imediatamente
  assert.equal(
    keyStoreA.verifyRecoveryAuthorization(authA, keyStoreB.publicKeyPem),
    false,
    "Deve rejeitar quando keyId do token diverge da chave pública confiável",
  );

  // 3. Se forçar auth.keyId = keyStoreB.keyId, a assinatura falha contra chave B
  const forgedAuth = structuredClone(authA);
  forgedAuth.keyId = keyStoreB.keyId;
  assert.equal(keyStoreA.verifyRecoveryAuthorization(forgedAuth, keyStoreB.publicKeyPem), false);
});
