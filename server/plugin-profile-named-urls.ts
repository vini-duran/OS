import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { Express } from "express";
import type { PluginProfileSetupNamedUrls } from "../src/lib/plugin-contract";

export type PluginProfileNamedUrlEntry = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  updatedAt: string;
};

export type PluginProfileNamedUrlErrorCode =
  | "NOT_ENABLED"
  | "NOT_BOUND"
  | "NOT_FOUND"
  | "FOREIGN_ENTRY"
  | "STALE_REVISION"
  | "MISSING_REVISION"
  | "INVALID_NAME"
  | "INVALID_URL"
  | "URL_NOT_HTTPS"
  | "URL_HAS_CREDENTIALS"
  | "URL_TOO_LONG"
  | "HOST_NOT_ALLOWED"
  | "PATH_NOT_ALLOWED"
  | "DUPLICATE_URL"
  | "EMPTY_UPDATE";

export class PluginProfileNamedUrlError extends Error {
  constructor(
    public readonly code: PluginProfileNamedUrlErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PluginProfileNamedUrlError";
  }
}

type NamedUrlRow = {
  id: string;
  plugin_id: string;
  profile_id: string;
  name: string;
  url: string;
  created_at: string;
  updated_at: string;
};

function rowToEntry(row: NamedUrlRow): PluginProfileNamedUrlEntry {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function computePluginProfileNamedUrlsRevision(
  entries: PluginProfileNamedUrlEntry[],
): string {
  const ordered = [...entries].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

export function validatePluginProfileNamedUrlName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) {
    throw new PluginProfileNamedUrlError("INVALID_NAME", 400, "Nome do projeto inválido.");
  }
  if (name.length > 100) {
    throw new PluginProfileNamedUrlError("INVALID_NAME", 400, "Nome do projeto inválido.");
  }
  return name;
}

export function validateAndNormalizePluginProfileNamedUrl(
  raw: unknown,
  config: PluginProfileSetupNamedUrls,
): string {
  const input = typeof raw === "string" ? raw.trim() : "";
  if (!input) {
    throw new PluginProfileNamedUrlError("INVALID_URL", 400, "URL do projeto inválida.");
  }
  if (input.length > 2048) {
    throw new PluginProfileNamedUrlError("URL_TOO_LONG", 400, "URL do projeto inválida.");
  }
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new PluginProfileNamedUrlError("INVALID_URL", 400, "URL do projeto inválida.");
  }
  if (parsed.protocol !== "https:") {
    throw new PluginProfileNamedUrlError("URL_NOT_HTTPS", 400, "URL do projeto inválida.");
  }
  if (parsed.username || parsed.password) {
    throw new PluginProfileNamedUrlError("URL_HAS_CREDENTIALS", 400, "URL do projeto inválida.");
  }
  const allowed = new Set(config.allowedHosts.map((host) => host.toLowerCase()));
  if (!allowed.has(parsed.hostname.toLowerCase())) {
    throw new PluginProfileNamedUrlError("HOST_NOT_ALLOWED", 400, "URL do projeto inválida.");
  }
  if (config.pathnamePattern !== undefined) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(config.pathnamePattern);
    } catch {
      throw new PluginProfileNamedUrlError("PATH_NOT_ALLOWED", 400, "URL do projeto inválida.");
    }
    if (!pattern.test(parsed.pathname)) {
      throw new PluginProfileNamedUrlError("PATH_NOT_ALLOWED", 400, "URL do projeto inválida.");
    }
  }
  const normalized = parsed.toString();
  if (normalized.length > 2048) {
    throw new PluginProfileNamedUrlError("URL_TOO_LONG", 400, "URL do projeto inválida.");
  }
  return normalized;
}

function readEntries(
  database: Database.Database,
  pluginId: string,
  profileId: string,
): PluginProfileNamedUrlEntry[] {
  const rows = database
    .prepare(
      `SELECT id, plugin_id, profile_id, name, url, created_at, updated_at
       FROM plugin_profile_named_urls
       WHERE plugin_id = ? AND profile_id = ?
       ORDER BY created_at, id`,
    )
    .all(pluginId, profileId) as NamedUrlRow[];
  return rows.map(rowToEntry);
}

function bindingExists(database: Database.Database, pluginId: string, profileId: string) {
  return Boolean(
    database
      .prepare(`SELECT 1 FROM plugin_profile_bindings WHERE plugin_id = ? AND profile_id = ?`)
      .get(pluginId, profileId),
  );
}

export class PluginProfileNamedUrlStore {
  constructor(private readonly database: Database.Database) {}

  list(pluginId: string, profileId: string) {
    const entries = readEntries(this.database, pluginId, profileId);
    return { entries, revision: computePluginProfileNamedUrlsRevision(entries) };
  }

  create(
    pluginId: string,
    profileId: string,
    input: { name: unknown; url: unknown },
    expectedRevision: unknown,
    config: PluginProfileSetupNamedUrls,
  ) {
    if (typeof expectedRevision !== "string" || !expectedRevision) {
      throw new PluginProfileNamedUrlError(
        "MISSING_REVISION",
        409,
        "A lista mudou. Recarregue antes de salvar.",
      );
    }
    const name = validatePluginProfileNamedUrlName(input.name);
    const url = validateAndNormalizePluginProfileNamedUrl(input.url, config);
    return this.database.transaction(() => {
      const current = readEntries(this.database, pluginId, profileId);
      if (computePluginProfileNamedUrlsRevision(current) !== expectedRevision) {
        throw new PluginProfileNamedUrlError(
          "STALE_REVISION",
          409,
          "A lista mudou. Recarregue antes de salvar.",
        );
      }
      if (current.some((entry) => entry.url === url)) {
        throw new PluginProfileNamedUrlError("DUPLICATE_URL", 409, "URL do projeto inválida.");
      }
      const now = new Date().toISOString();
      const id = randomUUID();
      try {
        this.database
          .prepare(
            `INSERT INTO plugin_profile_named_urls
             (id, plugin_id, profile_id, name, url, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(id, pluginId, profileId, name, url, now, now);
      } catch (error) {
        if (String((error as Error)?.message ?? "").includes("UNIQUE")) {
          throw new PluginProfileNamedUrlError("DUPLICATE_URL", 409, "URL do projeto inválida.");
        }
        throw error;
      }
      const entries = readEntries(this.database, pluginId, profileId);
      return { entries, revision: computePluginProfileNamedUrlsRevision(entries) };
    })();
  }

  update(
    pluginId: string,
    profileId: string,
    urlId: string,
    input: { name?: unknown; url?: unknown },
    expectedRevision: unknown,
    config: PluginProfileSetupNamedUrls,
  ) {
    if (typeof expectedRevision !== "string" || !expectedRevision) {
      throw new PluginProfileNamedUrlError(
        "MISSING_REVISION",
        409,
        "A lista mudou. Recarregue antes de salvar.",
      );
    }
    const hasName = input.name !== undefined;
    const hasUrl = input.url !== undefined;
    if (!hasName && !hasUrl) {
      throw new PluginProfileNamedUrlError("EMPTY_UPDATE", 400, "Nada para salvar.");
    }
    const name = hasName ? validatePluginProfileNamedUrlName(input.name) : undefined;
    const url = hasUrl ? validateAndNormalizePluginProfileNamedUrl(input.url, config) : undefined;
    return this.database.transaction(() => {
      const current = readEntries(this.database, pluginId, profileId);
      if (computePluginProfileNamedUrlsRevision(current) !== expectedRevision) {
        throw new PluginProfileNamedUrlError(
          "STALE_REVISION",
          409,
          "A lista mudou. Recarregue antes de salvar.",
        );
      }
      const target = current.find((entry) => entry.id === urlId);
      if (!target) {
        const elsewhere = this.database
          .prepare(`SELECT 1 FROM plugin_profile_named_urls WHERE id = ?`)
          .get(urlId);
        if (elsewhere) {
          throw new PluginProfileNamedUrlError("FOREIGN_ENTRY", 404, "URL não encontrada.");
        }
        throw new PluginProfileNamedUrlError("NOT_FOUND", 404, "URL não encontrada.");
      }
      if (url !== undefined && current.some((entry) => entry.id !== urlId && entry.url === url)) {
        throw new PluginProfileNamedUrlError("DUPLICATE_URL", 409, "URL do projeto inválida.");
      }
      const now = new Date().toISOString();
      try {
        this.database
          .prepare(
            `UPDATE plugin_profile_named_urls
             SET name = ?, url = ?, updated_at = ?
             WHERE plugin_id = ? AND profile_id = ? AND id = ?`,
          )
          .run(name ?? target.name, url ?? target.url, now, pluginId, profileId, urlId);
      } catch (error) {
        if (String((error as Error)?.message ?? "").includes("UNIQUE")) {
          throw new PluginProfileNamedUrlError("DUPLICATE_URL", 409, "URL do projeto inválida.");
        }
        throw error;
      }
      const entries = readEntries(this.database, pluginId, profileId);
      return { entries, revision: computePluginProfileNamedUrlsRevision(entries) };
    })();
  }

  remove(pluginId: string, profileId: string, urlId: string, expectedRevision: unknown) {
    if (typeof expectedRevision !== "string" || !expectedRevision) {
      throw new PluginProfileNamedUrlError(
        "MISSING_REVISION",
        409,
        "A lista mudou. Recarregue antes de salvar.",
      );
    }
    return this.database.transaction(() => {
      const current = readEntries(this.database, pluginId, profileId);
      if (computePluginProfileNamedUrlsRevision(current) !== expectedRevision) {
        throw new PluginProfileNamedUrlError(
          "STALE_REVISION",
          409,
          "A lista mudou. Recarregue antes de salvar.",
        );
      }
      const target = current.find((entry) => entry.id === urlId);
      if (!target) {
        const elsewhere = this.database
          .prepare(`SELECT 1 FROM plugin_profile_named_urls WHERE id = ?`)
          .get(urlId);
        if (elsewhere) {
          throw new PluginProfileNamedUrlError("FOREIGN_ENTRY", 404, "URL não encontrada.");
        }
        throw new PluginProfileNamedUrlError("NOT_FOUND", 404, "URL não encontrada.");
      }
      this.database
        .prepare(
          `DELETE FROM plugin_profile_named_urls
           WHERE plugin_id = ? AND profile_id = ? AND id = ?`,
        )
        .run(pluginId, profileId, urlId);
      const entries = readEntries(this.database, pluginId, profileId);
      return { entries, revision: computePluginProfileNamedUrlsRevision(entries) };
    })();
  }
}

export type PluginProfileNamedUrlPluginResolver = (
  pluginId: string,
) =>
  | { id: string; manifest: { profileSetup?: { namedUrls?: PluginProfileSetupNamedUrls } } }
  | undefined;

function sendNamedUrlError(
  response: { status: (code: number) => { json: (body: unknown) => void } },
  error: unknown,
) {
  if (error instanceof PluginProfileNamedUrlError) {
    response.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  response
    .status(500)
    .json({ error: "Não foi possível concluir a operação.", code: "OPERATION_FAILED" });
}

export function registerPluginProfileNamedUrlRoutes(
  app: Express,
  deps: { database: Database.Database; resolveProfilePlugin: PluginProfileNamedUrlPluginResolver },
) {
  const store = new PluginProfileNamedUrlStore(deps.database);

  function resolveContext(pluginId: string, profileId: string) {
    const plugin = deps.resolveProfilePlugin(pluginId);
    const config = plugin?.manifest?.profileSetup?.namedUrls;
    if (!plugin || !config) {
      throw new PluginProfileNamedUrlError(
        "NOT_ENABLED",
        404,
        "Este plugin não oferece projetos neste perfil.",
      );
    }
    if (!bindingExists(deps.database, plugin.id, profileId)) {
      throw new PluginProfileNamedUrlError("NOT_BOUND", 404, "Vínculo de perfil não encontrado.");
    }
    return { plugin, config };
  }

  app.get("/api/plugins/:pluginId/profile-bindings/:profileId/named-urls", (request, response) => {
    try {
      const pluginId = String(request.params.pluginId);
      const profileId = String(request.params.profileId);
      resolveContext(pluginId, profileId);
      response.json(store.list(pluginId, profileId));
    } catch (error) {
      sendNamedUrlError(response, error);
    }
  });

  app.post("/api/plugins/:pluginId/profile-bindings/:profileId/named-urls", (request, response) => {
    try {
      const pluginId = String(request.params.pluginId);
      const profileId = String(request.params.profileId);
      const { config } = resolveContext(pluginId, profileId);
      const body = (request.body ?? {}) as Record<string, unknown>;
      const result = store.create(
        pluginId,
        profileId,
        { name: body.name, url: body.url },
        body.revision,
        config,
      );
      response.status(201).json(result);
    } catch (error) {
      sendNamedUrlError(response, error);
    }
  });

  app.patch(
    "/api/plugins/:pluginId/profile-bindings/:profileId/named-urls/:urlId",
    (request, response) => {
      try {
        const pluginId = String(request.params.pluginId);
        const profileId = String(request.params.profileId);
        const urlId = String(request.params.urlId);
        const { config } = resolveContext(pluginId, profileId);
        const body = (request.body ?? {}) as Record<string, unknown>;
        const result = store.update(
          pluginId,
          profileId,
          urlId,
          {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.url !== undefined ? { url: body.url } : {}),
          },
          body.revision,
          config,
        );
        response.json(result);
      } catch (error) {
        sendNamedUrlError(response, error);
      }
    },
  );

  app.delete(
    "/api/plugins/:pluginId/profile-bindings/:profileId/named-urls/:urlId",
    (request, response) => {
      try {
        const pluginId = String(request.params.pluginId);
        const profileId = String(request.params.profileId);
        const urlId = String(request.params.urlId);
        resolveContext(pluginId, profileId);
        const body = (request.body ?? {}) as Record<string, unknown>;
        const result = store.remove(pluginId, profileId, urlId, body.revision);
        response.json(result);
      } catch (error) {
        sendNamedUrlError(response, error);
      }
    },
  );
}
