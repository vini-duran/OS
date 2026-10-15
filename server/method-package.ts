import type { Archiver, ArchiverError } from "archiver";
import yauzl from "yauzl";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { PortableProfileSetupResolver } from "../src/lib/profile-project-selection";
import { sanitizePortableConfiguration } from "../src/lib/profile-project-selection";

const archiver = createRequire(import.meta.url)("archiver") as {
  create: (format: "zip", options: { zlib: { level: number } }) => Archiver;
};

const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;
const coverDataPattern = /^data:image\/(webp|png|jpeg);base64,([a-zA-Z0-9+/=]+)$/;

type PortableMethod = {
  processType?: string;
  imageUrl?: string;
  blocks?: Array<{
    plugin?: {
      pluginId?: string;
      configuration?: Record<string, string | number | boolean>;
      connectionId?: string;
      profileExecution?: unknown;
    };
  }>;
};
type PortableMethodEntry = PortableMethod | { method?: PortableMethod };
type PortableStoredFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  url?: string;
  sha256?: string;
};
type PortableItem = { key?: string; values?: Record<string, unknown> };
type PortableManifest = {
  format?: string;
  method?: PortableMethod;
  methods?: PortableMethodEntry[];
  channelImageUrl?: string;
  items?: PortableItem[];
};

export type MethodPackageProfileSetupResolver = PortableProfileSetupResolver;

/**
 * Portable sanitizer for package export/transmission. Reuses the canonical
 * portable sanitizer and real plugin metadata; no duplicated key lists.
 * Physical/catalog IDs (profileExecution + connectionId) are ALWAYS dropped,
 * even when no resolver is provided. Managed raw URLs are stripped via
 * generic metadata when available. Resolver semantics:
 * - object: known WITH profileSetup — strip owned keys, preserve the rest.
 * - null: known WITHOUT profileSetup — preserve ordinary configuration.
 * - undefined with resolver: unknown/unavailable — fail-closed unconfigured
 *   `{}` so no stale local URL can leak (may drop unrelated keys for
 *   unknown plugins only). Resolver-free legacy calls preserve configuration
 *   as-is (limit documented) but still drop IDs.
 * Internal/local clones bypass packaging. Forged imports drop the same
 * fields on read; unknown importing packages never count as known.
 */
export function sanitizePortableManifestBlocks(
  manifest: PortableManifest,
  profileSetupForPlugin?: MethodPackageProfileSetupResolver,
): PortableManifest {
  const resolverProvided = Boolean(profileSetupForPlugin);
  const sanitizeBlocks = (blocks: PortableMethod["blocks"]) => {
    for (const block of blocks ?? []) {
      const plugin = block.plugin;
      if (!plugin) continue;
      // Catalog IDs never leave: always drop the policy + connection handle.
      delete plugin.profileExecution;
      delete plugin.connectionId;
      if (!plugin.configuration) continue;
      const setup = profileSetupForPlugin?.(String(plugin.pluginId ?? ""));
      if (setup) {
        // Stale raw key is stripped via current metadata even when no
        // profileExecution policy is present on the block.
        plugin.configuration = sanitizePortableConfiguration(
          { ...plugin.configuration },
          setup,
          true,
        ) as Record<string, string | number | boolean>;
      } else if (setup === null || !resolverProvided) {
        // Known without profileSetup, or resolver-free legacy: preserve
        // ordinary configuration; IDs already dropped above.
      } else {
        // Unknown plugin with resolver: fail-closed unconfigured block.
        plugin.configuration = {};
      }
      // Resolver omitted: legacy limit — configuration preserved, IDs dropped.
    }
  };
  if (manifest.method) sanitizeBlocks(manifest.method.blocks);
  for (const entry of manifest.methods ?? []) {
    const method = methodFromEntry(entry);
    if (method) sanitizeBlocks(method.blocks);
  }
  return manifest;
}

function methodFromEntry(entry: PortableMethodEntry): PortableMethod | undefined {
  if ("method" in entry) return entry.method;
  return entry as PortableMethod;
}

function storedFile(value: unknown): PortableStoredFile | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as PortableStoredFile;
  return typeof candidate.url === "string" && typeof candidate.mimeType === "string"
    ? candidate
    : undefined;
}

function safeAssetExtension(file: PortableStoredFile) {
  const fromName = path
    .extname(file.name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "")
    .slice(0, 12);
  if (fromName && fromName !== ".") return fromName;
  const mime = file.mimeType ?? "";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "audio/mpeg") return ".mp3";
  if (mime === "video/mp4") return ".mp4";
  if (mime === "application/pdf") return ".pdf";
  return ".bin";
}

async function extractItemAsset(
  file: PortableStoredFile,
  target: string,
  resolveLocalAsset?: (url: string) => Buffer | Promise<Buffer>,
) {
  const dataMatch = /^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/.exec(file.url ?? "");
  const data = dataMatch
    ? Buffer.from(dataMatch[2], "base64")
    : file.url?.startsWith("/api/files/") && resolveLocalAsset
      ? await resolveLocalAsset(file.url)
      : undefined;
  if (!data?.length) throw new Error(`O asset “${file.name ?? "arquivo"}” não pôde ser lido.`);
  if (data.length > MAX_PACKAGE_BYTES) throw new Error("Um asset excede o limite do pacote.");
  const sha256 = createHash("sha256").update(data).digest("hex");
  if (file.sha256 && file.sha256 !== sha256)
    throw new Error("A integridade de um asset não confere.");
  return { target: `${target}${safeAssetExtension(file)}`, data, sha256 };
}

async function extractCover(
  source: string | undefined,
  target: string,
  resolveLocalAsset?: (url: string) => Buffer | Promise<Buffer>,
) {
  if (!source) return undefined;
  const match = coverDataPattern.exec(source);
  const data = match
    ? Buffer.from(match[2], "base64")
    : source.startsWith("/api/files/") && resolveLocalAsset
      ? await resolveLocalAsset(source)
      : undefined;
  if (!data) throw new Error("A capa do pacote é inválida.");
  if (!data.length || data.length > 2 * 1024 * 1024) {
    throw new Error("A capa do pacote excede o limite permitido.");
  }
  const extension = match ? (match[1] === "jpeg" ? "jpg" : match[1]) : "webp";
  return { target: target.replace(/\.webp$/, `.${extension}`), data };
}

export async function createMethodPackage(
  manifestText: string,
  resolveLocalAsset?: (url: string) => Buffer | Promise<Buffer>,
  profileSetupForPlugin?: MethodPackageProfileSetupResolver,
) {
  const manifest = JSON.parse(manifestText) as PortableManifest;
  if (!["contentflow-method", "contentflow-method-pack"].includes(manifest.format ?? "")) {
    throw new Error("Manifesto de Métodos inválido.");
  }
  sanitizePortableManifestBlocks(manifest, profileSetupForPlugin);
  const assets: { target: string; data: Buffer }[] = [];
  if (manifest.method?.imageUrl) {
    const asset = await extractCover(
      manifest.method.imageUrl,
      `assets/method-${manifest.method.processType ?? "cover"}.webp`,
      resolveLocalAsset,
    );
    if (asset) {
      assets.push(asset);
      manifest.method.imageUrl = asset.target;
    }
  }
  for (const entry of manifest.methods ?? []) {
    const method = methodFromEntry(entry);
    if (!method) continue;
    const asset = await extractCover(
      method.imageUrl,
      `assets/method-${method.processType ?? "cover"}.webp`,
      resolveLocalAsset,
    );
    if (asset) {
      assets.push(asset);
      method.imageUrl = asset.target;
    }
  }
  if (manifest.channelImageUrl) {
    const asset = await extractCover(
      manifest.channelImageUrl,
      "assets/channel-cover.webp",
      resolveLocalAsset,
    );
    if (asset) {
      assets.push(asset);
      manifest.channelImageUrl = asset.target;
    }
  }
  let itemAssetIndex = 0;
  for (const item of manifest.items ?? []) {
    for (const [fieldKey, value] of Object.entries(item.values ?? {})) {
      const file = storedFile(value);
      if (!file) continue;
      itemAssetIndex += 1;
      const asset = await extractItemAsset(
        file,
        `assets/items/item-${itemAssetIndex}`,
        resolveLocalAsset,
      );
      assets.push(asset);
      item.values![fieldKey] = {
        ...file,
        size: asset.data.length,
        sha256: asset.sha256,
        url: asset.target,
      };
    }
  }

  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
  const totalPackageBytes =
    manifestBuffer.length + assets.reduce((total, asset) => total + asset.data.length, 0);
  if (totalPackageBytes > MAX_PACKAGE_BYTES) {
    throw new Error("O pacote excede o limite total de 20 MB.");
  }

  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    output.on("end", () => resolve(Buffer.concat(chunks)));
    output.on("error", reject);
  });
  const archive = archiver.create("zip", { zlib: { level: 9 } });
  archive.on("error", (error: ArchiverError) => output.destroy(error));
  archive.pipe(output);
  archive.append(manifestBuffer, { name: "manifest.json" });
  for (const asset of assets) archive.append(asset.data, { name: asset.target });
  await archive.finalize();
  return completed;
}

function readZipEntries(buffer: Buffer) {
  return new Promise<Map<string, Buffer>>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error ?? new Error("Pacote ZIP inválido."));
      const entries = new Map<string, Buffer>();
      let total = 0;
      zip.on("error", reject);
      zip.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) return zip.readEntry();
        if (
          entry.fileName.includes("..") ||
          entry.fileName.includes("\\") ||
          (entry.fileName !== "manifest.json" &&
            entry.fileName !== "LICENSE" &&
            !/^assets\/[a-z0-9-]+\.(webp|png|jpg)$/.test(entry.fileName) &&
            !/^assets\/items\/[a-z0-9._-]+$/.test(entry.fileName))
        ) {
          zip.close();
          return reject(new Error("O pacote contém um caminho não permitido."));
        }
        if (entries.size >= 520 || entry.uncompressedSize > MAX_PACKAGE_BYTES) {
          zip.close();
          return reject(new Error("O pacote excede os limites permitidos."));
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream)
            return reject(streamError ?? new Error("Entrada ZIP inválida."));
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => {
            total += chunk.length;
            if (total > MAX_PACKAGE_BYTES) {
              stream.destroy(new Error("O pacote excede os limites permitidos."));
              return;
            }
            chunks.push(chunk);
          });
          stream.on("error", reject);
          stream.on("end", () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(entries));
      zip.readEntry();
    });
  });
}

export async function readMethodPackage(
  buffer: Buffer,
  storeAsset?: (assetPath: string, data: Buffer) => string | Promise<string>,
  profileSetupForPlugin?: MethodPackageProfileSetupResolver,
) {
  const entries = await readZipEntries(buffer);
  const manifestBuffer = entries.get("manifest.json");
  if (!manifestBuffer) throw new Error("O pacote não contém manifest.json.");
  const manifest = JSON.parse(manifestBuffer.toString("utf8")) as PortableManifest;
  const restore = async (assetPath: string | undefined) => {
    if (!assetPath?.startsWith("assets/")) return assetPath;
    const asset = entries.get(assetPath);
    if (!asset) throw new Error(`A capa ${assetPath} não foi encontrada no pacote.`);
    const extension = assetPath.split(".").pop();
    const mime = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
    return storeAsset
      ? await storeAsset(assetPath, asset)
      : `data:${mime};base64,${asset.toString("base64")}`;
  };
  if (manifest.method) manifest.method.imageUrl = await restore(manifest.method.imageUrl);
  for (const entry of manifest.methods ?? []) {
    const method = methodFromEntry(entry);
    if (method) method.imageUrl = await restore(method.imageUrl);
  }
  manifest.channelImageUrl = await restore(manifest.channelImageUrl);
  for (const item of manifest.items ?? []) {
    for (const [fieldKey, value] of Object.entries(item.values ?? {})) {
      const file = storedFile(value);
      if (!file?.url?.startsWith("assets/items/")) continue;
      const asset = entries.get(file.url);
      if (!asset) throw new Error(`O asset ${file.url} não foi encontrado no pacote.`);
      const sha256 = createHash("sha256").update(asset).digest("hex");
      if (file.sha256 && file.sha256 !== sha256) {
        throw new Error(`A integridade do asset ${file.url} não confere.`);
      }
      if (typeof file.size === "number" && file.size !== asset.length) {
        throw new Error(`O tamanho do asset ${file.url} não confere.`);
      }
      const restoredUrl = storeAsset
        ? await storeAsset(file.url, asset)
        : `data:${file.mimeType};base64,${asset.toString("base64")}`;
      item.values![fieldKey] = { ...file, size: asset.length, sha256, url: restoredUrl };
    }
  }
  // Forged external payloads never confer trust: drop IDs/managed values on
  // read as well, using real plugin metadata when available.
  sanitizePortableManifestBlocks(manifest, profileSetupForPlugin);
  return JSON.stringify(manifest);
}
