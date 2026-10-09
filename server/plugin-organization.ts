/**
 * Persistência da organização local da biblioteca de plugins (Interface 3).
 *
 * Preferência separada do contrato `/api/preferences`: lê e grava somente a
 * coluna `plugin_organization` de `app_preferences`, preservando
 * theme/language/notificações e demais campos. A única migração aditiva
 * permitida aqui é criar essa coluna quando ausente.
 *
 * GET não altera preferências: garante apenas a coluna aditiva quando ausente.
 * Sem linha global, devolve a organização
 * padrão em memória. PUT exige a revisão atual (409 para aba obsoleta) e
 * escreve em transação.
 */
import type Database from "better-sqlite3";
import type { Express, Request, Response } from "express";

import {
  defaultPluginOrganization,
  normalizePluginOrganization,
  pluginOrganizationRevision,
  validatePluginOrganizationForWrite,
  type PluginOrganization,
} from "../src/lib/plugin-organization";

export const PLUGIN_ORGANIZATION_COLUMN = "plugin_organization";

export type PluginOrganizationState = {
  organization: PluginOrganization;
  revision: string;
};

export class PluginOrganizationHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly state?: PluginOrganizationState,
  ) {
    super(message);
  }
}

type AppPreferencesDatabase = Pick<Database.Database, "prepare" | "exec" | "transaction">;

/** Migração aditiva única: cria a coluna somente se ausente. */
export function ensurePluginOrganizationColumn(database: AppPreferencesDatabase) {
  const columns = database.prepare("PRAGMA table_info(app_preferences)").all() as Array<{
    name: string;
  }>;
  if (!columns.some((column) => column.name === PLUGIN_ORGANIZATION_COLUMN)) {
    database.exec(
      `ALTER TABLE app_preferences ADD COLUMN ${PLUGIN_ORGANIZATION_COLUMN} TEXT NOT NULL DEFAULT '{}'`,
    );
  }
}

function parseStoredOrganization(raw: unknown): PluginOrganization {
  if (typeof raw !== "string" || raw.trim() === "") return defaultPluginOrganization();
  try {
    return normalizePluginOrganization(JSON.parse(raw) as unknown);
  } catch {
    return defaultPluginOrganization();
  }
}

/** Leitura sem alterar valores: nunca cria linha; garante somente a coluna aditiva. */
export function readPluginOrganization(database: AppPreferencesDatabase): PluginOrganizationState {
  ensurePluginOrganizationColumn(database);
  const row = database
    .prepare(
      `SELECT ${PLUGIN_ORGANIZATION_COLUMN} AS stored FROM app_preferences WHERE id = 'global'`,
    )
    .get() as { stored?: unknown } | undefined;
  if (!row) {
    const organization = defaultPluginOrganization();
    return { organization, revision: pluginOrganizationRevision(organization) };
  }
  const organization = parseStoredOrganization(row.stored);
  return { organization, revision: pluginOrganizationRevision(organization) };
}

export function writePluginOrganization(
  database: AppPreferencesDatabase,
  body: unknown,
): PluginOrganizationState {
  ensurePluginOrganizationColumn(database);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PluginOrganizationHttpError(400, "Organização inválida.");
  }
  const payload = body as Record<string, unknown>;
  if (typeof payload.revision !== "string" || payload.revision.trim() === "") {
    throw new PluginOrganizationHttpError(400, "Organização inválida.");
  }
  const validation = validatePluginOrganizationForWrite(payload.organization);
  if (!validation.ok) {
    throw new PluginOrganizationHttpError(400, "Organização inválida.");
  }

  const current = readPluginOrganization(database);
  if (payload.revision !== current.revision) {
    throw new PluginOrganizationHttpError(
      409,
      "A organização mudou em outra aba. Recarregue antes de salvar.",
      current,
    );
  }

  const serialized = JSON.stringify(validation.organization);
  const updatedAt = new Date().toISOString();
  const commit = database.transaction(() => {
    const updated = database
      .prepare(
        `UPDATE app_preferences SET ${PLUGIN_ORGANIZATION_COLUMN} = ?, updated_at = ? WHERE id = 'global'`,
      )
      .run(serialized, updatedAt);
    if (updated.changes === 0) {
      // Sem linha global: cria com os padrões, sem sobrescrever nada existente.
      database
        .prepare(
          `INSERT INTO app_preferences (
             id, theme, language, notification_sound, system_notifications,
             methods_library_view, ${PLUGIN_ORGANIZATION_COLUMN}, updated_at
           ) VALUES ('global', 'dark', 'pt-BR', 0, 0, 'channels', ?, ?)`,
        )
        .run(serialized, updatedAt);
    }
  });
  commit();

  return readPluginOrganization(database);
}

export function registerPluginOrganizationRoutes(app: Express, database: AppPreferencesDatabase) {
  app.get("/api/plugins/organization", (_request: Request, response: Response) => {
    try {
      response.json(readPluginOrganization(database));
    } catch {
      response.status(500).json({ error: "Não foi possível carregar a organização." });
    }
  });

  app.put("/api/plugins/organization", (request: Request, response: Response) => {
    try {
      response.json(writePluginOrganization(database, request.body));
    } catch (error) {
      if (error instanceof PluginOrganizationHttpError) {
        if (error.status === 409 && error.state) {
          response.status(409).json({
            error: "A organização mudou em outra aba. Recarregue antes de salvar.",
            organization: error.state.organization,
            revision: error.state.revision,
          });
          return;
        }
        response.status(error.status).json({ error: error.message });
        return;
      }
      response.status(500).json({ error: "Não foi possível salvar a organização." });
    }
  });
}
