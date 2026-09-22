import {
  generateKeyPairSync,
  sign,
  verify,
  createHash,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  type KeyObject,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  PluginRecoveryAuthorization,
  PluginRecoveryAuthorizationTarget,
} from "../../src/lib/domain";

export const CANONICAL_RECOVERY_AUTH_VERSION = "CONTENTFLOW_RECOVERY_AUTHORIZATION_V1" as const;

export type CoreKeyStoreOptions = {
  securityDirectory?: string;
  privateKeyPem?: string;
  publicKeyPem?: string;
  keyId?: string;
};

/**
 * Constrói a serialização canônica em linhas UTF-8 ordenadas e inequívocas para assinatura Ed25519.
 *
 * Formato canônico RFC-compatível por linhas:
 * CONTENTFLOW_RECOVERY_AUTHORIZATION_V1
 * keyId:<keyId>
 * token:<token>
 * authorizedAt:<authorizedAt>
 * origin:<origin>
 * target.executionId:<executionId>
 * target.blockId:<blockId>
 * target.attempt:<attempt>
 * ext.system:<system> | ext:none
 * ext.runId:<runId>
 * ext.targetId:<targetId>
 * ext.cycle:<cycle>
 * ext.snapshotRevision:<snapshotRevision>
 */
export function buildCanonicalRecoveryPayload(params: {
  keyId: string;
  token: string;
  authorizedAt: string;
  origin: "user_action";
  target: PluginRecoveryAuthorizationTarget;
}): string {
  const ext = params.target.externalTarget;
  const lines = [
    CANONICAL_RECOVERY_AUTH_VERSION,
    `keyId:${params.keyId}`,
    `token:${params.token}`,
    `authorizedAt:${params.authorizedAt}`,
    `origin:${params.origin}`,
    `target.executionId:${params.target.executionId}`,
    `target.blockId:${params.target.blockId}`,
    `target.attempt:${params.target.attempt}`,
  ];

  if (ext) {
    lines.push(
      `ext.system:${ext.system}`,
      `ext.runId:${ext.runId}`,
      `ext.targetId:${ext.targetId}`,
      `ext.cycle:${ext.cycle}`,
      `ext.snapshotRevision:${ext.snapshotRevision}`,
    );
  } else {
    lines.push("ext:none");
  }

  return lines.join("\n");
}

export function deriveCoreKeyId(publicKeyPem: string): string {
  const hash = createHash("sha256").update(publicKeyPem.trim()).digest("hex").slice(0, 16);
  return `core_ed25519_${hash}`;
}

export class CoreKeyStore {
  private privateKey: KeyObject;
  private publicKey: KeyObject;
  public readonly keyId: string;
  public readonly publicKeyPem: string;

  constructor(options: CoreKeyStoreOptions = {}) {
    if (options.privateKeyPem && options.publicKeyPem) {
      const derivedKeyId = deriveCoreKeyId(options.publicKeyPem);
      if (options.keyId && options.keyId !== derivedKeyId) {
        throw new Error(
          `Inconsistência na keystore do Core: keyId '${options.keyId}' não corresponde à chave pública informada ('${derivedKeyId}').`,
        );
      }
      this.privateKey = createPrivateKey(options.privateKeyPem);
      this.publicKey = createPublicKey(options.publicKeyPem);
      this.publicKeyPem = options.publicKeyPem;
      this.keyId = derivedKeyId;
      return;
    }

    if (options.securityDirectory) {
      const secDir = path.resolve(options.securityDirectory);
      mkdirSync(secDir, { recursive: true, mode: 0o700 });
      const privPath = path.join(secDir, "core_private_key.pem");
      const pubPath = path.join(secDir, "core_public_key.pem");
      const metaPath = path.join(secDir, "core_key_metadata.json");

      const privExists = existsSync(privPath);
      const pubExists = existsSync(pubPath);
      const metaExists = existsSync(metaPath);

      // Se qualquer arquivo existe, o diretório já foi inicializado: validar sem sobrescrever
      if (privExists || pubExists || metaExists) {
        if (!privExists || !pubExists) {
          throw new Error(
            "Inconsistência na keystore do Core: arquivos de chave incompletos no diretório de segurança.",
          );
        }

        const privPem = readFileSync(privPath, "utf8");
        const pubPem = readFileSync(pubPath, "utf8");

        let privKey: KeyObject;
        let pubKey: KeyObject;
        try {
          privKey = createPrivateKey(privPem);
          pubKey = createPublicKey(pubPem);
        } catch (error) {
          throw new Error(
            `Inconsistência na keystore do Core: material PEM corrompido ou inválido (${error instanceof Error ? error.message : "formato inválido"}).`,
          );
        }

        const derivedKeyId = deriveCoreKeyId(pubPem);

        if (metaExists) {
          let meta: { keyId?: string; algorithm?: string };
          try {
            meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
              keyId?: string;
              algorithm?: string;
            };
          } catch {
            throw new Error(
              "Inconsistência na keystore do Core: arquivo core_key_metadata.json corrompido.",
            );
          }
          if (meta.algorithm !== "ed25519") {
            throw new Error(
              `Inconsistência na keystore do Core: algoritmo declarado '${meta.algorithm}' diverge do esperado 'ed25519'.`,
            );
          }
          if (meta.keyId !== derivedKeyId) {
            throw new Error(
              `Inconsistência na keystore do Core: keyId nos metadados ('${meta.keyId}') diverge da chave pública efetiva ('${derivedKeyId}').`,
            );
          }
        }

        this.publicKeyPem = pubPem;
        this.privateKey = privKey;
        this.publicKey = pubKey;
        this.keyId = derivedKeyId;
        return;
      }

      // Gera novo par Ed25519 e persiste com permissões restritas (0o600 para chave privada)
      const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      const generatedKeyId = deriveCoreKeyId(publicKey);
      writeFileSync(privPath, privateKey, { mode: 0o600 });
      writeFileSync(pubPath, publicKey, { mode: 0o644 });
      writeFileSync(
        metaPath,
        JSON.stringify(
          {
            keyId: generatedKeyId,
            algorithm: "ed25519",
            createdAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        { mode: 0o644 },
      );
      this.publicKeyPem = publicKey;
      this.privateKey = createPrivateKey(privateKey);
      this.publicKey = createPublicKey(publicKey);
      this.keyId = generatedKeyId;
      return;
    }

    // Material efêmero em memória para instâncias sem pasta configurada (testes)
    const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    this.publicKeyPem = publicKey;
    this.privateKey = createPrivateKey(privateKey);
    this.publicKey = createPublicKey(publicKey);
    this.keyId = deriveCoreKeyId(publicKey);
  }

  public signRecoveryAuthorization(params: {
    token?: string;
    authorizedAt?: string;
    target: PluginRecoveryAuthorizationTarget;
  }): PluginRecoveryAuthorization {
    const token = params.token ?? randomUUID();
    const authorizedAt = params.authorizedAt ?? new Date().toISOString();
    const origin = "user_action" as const;

    const canonical = buildCanonicalRecoveryPayload({
      keyId: this.keyId,
      token,
      authorizedAt,
      origin,
      target: params.target,
    });

    const signature = sign(null, Buffer.from(canonical, "utf8"), this.privateKey).toString(
      "base64",
    );

    return {
      version: "1",
      token,
      authorizedAt,
      origin,
      keyId: this.keyId,
      algorithm: "ed25519",
      target: structuredClone(params.target),
      signature,
    };
  }

  public verifyRecoveryAuthorization(
    auth: PluginRecoveryAuthorization,
    trustedPublicKeyPem?: string,
  ): boolean {
    if (!auth || typeof auth !== "object") return false;
    if (auth.version !== "1" || auth.algorithm !== "ed25519" || auth.origin !== "user_action") {
      return false;
    }
    if (!auth.signature || typeof auth.signature !== "string") return false;
    if (!auth.keyId || typeof auth.keyId !== "string") return false;

    // Confere correspondência estrita entre o keyId declarado e a chave pública confiável utilizada
    const verifyingPubPem = trustedPublicKeyPem ?? this.publicKeyPem;
    const expectedKeyId = deriveCoreKeyId(verifyingPubPem);
    if (auth.keyId !== expectedKeyId) {
      return false;
    }

    const canonical = buildCanonicalRecoveryPayload({
      keyId: auth.keyId,
      token: auth.token,
      authorizedAt: auth.authorizedAt,
      origin: auth.origin,
      target: auth.target,
    });

    try {
      const pubKey = trustedPublicKeyPem ? createPublicKey(trustedPublicKeyPem) : this.publicKey;
      return verify(
        null,
        Buffer.from(canonical, "utf8"),
        pubKey,
        Buffer.from(auth.signature, "base64"),
      );
    } catch {
      return false;
    }
  }

  public getPublicKeyInfo(): { keyId: string; algorithm: "ed25519"; publicKeyPem: string } {
    return {
      keyId: this.keyId,
      algorithm: "ed25519",
      publicKeyPem: this.publicKeyPem,
    };
  }
}
