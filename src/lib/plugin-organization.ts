/**
 * Organização local da biblioteca de plugins (Interface 3).
 *
 * Preferência puramente local: agrupa plugins instalados em seções nomeadas,
 * marca favoritos e preserva a ordem dos cards. Não altera instalação,
 * ativação, permissões, conexões ou qualquer outro estado do núcleo.
 *
 * Formato histórico confirmado (lido, nunca confundido com Method/API legado):
 * `{ items: { '<plugin-id>': { section, favorite, hidden } },
 *    sectionOrder: { generation: [], editing: [], publishing: [], utilities: [],
 *                    none: [...] } }`.
 * O formato atual acrescenta `sections: [{ id, name?, builtIn? }]` e `version`.
 */

import { isPluginCardSize, normalizePluginCardSize, type PluginCardSize } from "./plugin-card-size";

export type { PluginCardSize } from "./plugin-card-size";

export const PLUGIN_ORGANIZATION_VERSION = 1;

export const PLUGIN_ORGANIZATION_NONE_SECTION_ID = "none";

export const PLUGIN_ORGANIZATION_BUILT_IN_SECTION_IDS = [
  "generation",
  "editing",
  "publishing",
  "utilities",
] as const;

export type PluginOrganizationBuiltInSectionId =
  (typeof PLUGIN_ORGANIZATION_BUILT_IN_SECTION_IDS)[number];

export type PluginOrganizationSectionId = string;

export type PluginOrganizationSection = {
  id: string;
  /** Nome editado pelo usuário. Ausente nas seções padrão = rótulo traduzido. */
  name?: string;
  builtIn?: boolean;
};

export type PluginOrganizationItem = {
  section: string;
  favorite: boolean;
  hidden: boolean;
};

export type PluginOrganization = {
  version: typeof PLUGIN_ORGANIZATION_VERSION;
  sections: PluginOrganizationSection[];
  items: Record<string, PluginOrganizationItem>;
  sectionOrder: Record<string, string[]>;
  /** Tamanho dos cards. Opcional no JSON legado; ausente = `medium`. */
  cardSize?: PluginCardSize;
};

export const PLUGIN_ORGANIZATION_LIMITS = {
  maxSections: 32,
  maxItems: 3000,
  maxSectionIdLength: 48,
  maxSectionNameLength: 80,
  maxPluginIdLength: 256,
  maxRawBytes: 256_000,
} as const;

const SECTION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

function isUnsafeKey(key: string) {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

function sanitizeSectionId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  if (
    trimmed.length === 0 ||
    trimmed.length > PLUGIN_ORGANIZATION_LIMITS.maxSectionIdLength ||
    !SECTION_ID_PATTERN.test(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

function sanitizePluginId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > PLUGIN_ORGANIZATION_LIMITS.maxPluginIdLength ||
    isUnsafeKey(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

function sanitizeSectionName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0 || trimmed.length > PLUGIN_ORGANIZATION_LIMITS.maxSectionNameLength) {
    return undefined;
  }
  return trimmed;
}

function slugifySectionName(name: string): string | undefined {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PLUGIN_ORGANIZATION_LIMITS.maxSectionIdLength);
  return slug || undefined;
}

export function defaultPluginOrganization(): PluginOrganization {
  return {
    version: PLUGIN_ORGANIZATION_VERSION,
    sections: [
      ...PLUGIN_ORGANIZATION_BUILT_IN_SECTION_IDS.map((id) => ({ id, builtIn: true })),
      { id: PLUGIN_ORGANIZATION_NONE_SECTION_ID },
    ],
    items: {},
    sectionOrder: Object.fromEntries(
      [...PLUGIN_ORGANIZATION_BUILT_IN_SECTION_IDS, PLUGIN_ORGANIZATION_NONE_SECTION_ID].map(
        (id) => [id, []],
      ),
    ),
    cardSize: "medium",
  };
}

function cloneOrganization(organization: PluginOrganization): PluginOrganization {
  return {
    version: PLUGIN_ORGANIZATION_VERSION,
    sections: organization.sections.map((section) => ({ ...section })),
    items: Object.fromEntries(
      Object.entries(organization.items).map(([id, item]) => [id, { ...item }]),
    ),
    sectionOrder: Object.fromEntries(
      Object.entries(organization.sectionOrder).map(([id, list]) => [id, [...list]]),
    ),
    cardSize: normalizePluginCardSize(organization.cardSize),
  };
}

function knownSectionIds(organization: PluginOrganization): Set<string> {
  return new Set(organization.sections.map((section) => section.id));
}

/**
 * Normalização tolerante (leitura): aceita o formato histórico e o atual,
 * repara referências a seções desconhecidas movendo para `none` e nunca
 * apaga referências a plugins temporariamente ausentes.
 */
export function normalizePluginOrganization(raw: unknown): PluginOrganization {
  const organization = defaultPluginOrganization();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return organization;
  const source = raw as Record<string, unknown>;

  if (Array.isArray(source.sections)) {
    for (const entry of source.sections) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const record = entry as Record<string, unknown>;
      const id = sanitizeSectionId(record.id);
      if (!id || isUnsafeKey(id)) continue;
      if (organization.sections.some((section) => section.id === id)) continue;
      if (organization.sections.length >= PLUGIN_ORGANIZATION_LIMITS.maxSections) break;
      const name = sanitizeSectionName(record.name);
      const builtIn =
        (PLUGIN_ORGANIZATION_BUILT_IN_SECTION_IDS as readonly string[]).includes(id) ||
        record.builtIn === true;
      organization.sections.push(
        builtIn && !name
          ? { id, builtIn: true }
          : { id, ...(name ? { name } : {}), ...(builtIn ? { builtIn: true } : {}) },
      );
      organization.sectionOrder[id] = [];
    }
  }

  // Garante as seções reservadas mesmo quando `sections` veio parcial.
  for (const id of [
    ...PLUGIN_ORGANIZATION_BUILT_IN_SECTION_IDS,
    PLUGIN_ORGANIZATION_NONE_SECTION_ID,
  ]) {
    if (!organization.sections.some((section) => section.id === id)) {
      organization.sections.push(
        id === PLUGIN_ORGANIZATION_NONE_SECTION_ID ? { id } : { id, builtIn: true },
      );
    }
    organization.sectionOrder[id] ??= [];
  }

  organization.cardSize = normalizePluginCardSize(source.cardSize);

  const known = knownSectionIds(organization);

  if (source.items && typeof source.items === "object" && !Array.isArray(source.items)) {
    for (const [rawId, rawItem] of Object.entries(source.items)) {
      const pluginId = sanitizePluginId(rawId);
      if (!pluginId) continue;
      if (Object.keys(organization.items).length >= PLUGIN_ORGANIZATION_LIMITS.maxItems) break;
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
        organization.items[pluginId] = {
          section: PLUGIN_ORGANIZATION_NONE_SECTION_ID,
          favorite: false,
          hidden: false,
        };
        continue;
      }
      const record = rawItem as Record<string, unknown>;
      const section =
        typeof record.section === "string" && known.has(record.section)
          ? record.section
          : PLUGIN_ORGANIZATION_NONE_SECTION_ID;
      organization.items[pluginId] = {
        section,
        favorite: record.favorite === true,
        hidden: record.hidden === true,
      };
    }
  }

  if (
    source.sectionOrder &&
    typeof source.sectionOrder === "object" &&
    !Array.isArray(source.sectionOrder)
  ) {
    for (const [rawSectionId, rawList] of Object.entries(source.sectionOrder)) {
      if (isUnsafeKey(rawSectionId) || !Array.isArray(rawList)) continue;
      const target = known.has(rawSectionId) ? rawSectionId : PLUGIN_ORGANIZATION_NONE_SECTION_ID;
      const list = (organization.sectionOrder[target] ??= []);
      for (const entry of rawList) {
        const pluginId = sanitizePluginId(entry);
        if (!pluginId || list.includes(pluginId)) continue;
        list.push(pluginId);
        organization.items[pluginId] ??= {
          section: target,
          favorite: false,
          hidden: false,
        };
      }
    }
  }

  // Todo item precisa aparecer em alguma lista, na sua seção.
  for (const [pluginId, item] of Object.entries(organization.items)) {
    const list = (organization.sectionOrder[item.section] ??= []);
    if (!list.includes(pluginId)) list.push(pluginId);
  }

  return organization;
}

export type PluginOrganizationValidation =
  { ok: true; organization: PluginOrganization } | { ok: false; error: string };

/**
 * Validação estrita (escrita): rejeita seções duplicadas, ids inválidos,
 * referências a seções desconhecidas e estouros de limite.
 */
export function validatePluginOrganizationForWrite(raw: unknown): PluginOrganizationValidation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "organization must be an object" };
  }
  let rawBytes = 0;
  try {
    rawBytes = new TextEncoder().encode(JSON.stringify(raw)).length;
  } catch {
    return { ok: false, error: "organization is not serializable" };
  }
  if (rawBytes > PLUGIN_ORGANIZATION_LIMITS.maxRawBytes) {
    return { ok: false, error: "organization exceeds size limit" };
  }
  const source = raw as Record<string, unknown>;
  if (source.version !== undefined && source.version !== PLUGIN_ORGANIZATION_VERSION) {
    return { ok: false, error: "unsupported organization version" };
  }
  let cardSize: PluginCardSize = "medium";
  if (source.cardSize !== undefined) {
    if (!isPluginCardSize(source.cardSize)) {
      return { ok: false, error: "invalid card size" };
    }
    cardSize = source.cardSize;
  }

  const sections: PluginOrganizationSection[] = [];
  const seenSectionIds = new Set<string>();
  if (source.sections !== undefined) {
    if (!Array.isArray(source.sections)) {
      return { ok: false, error: "sections must be an array" };
    }
    for (const entry of source.sections) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return { ok: false, error: "invalid section entry" };
      }
      const record = entry as Record<string, unknown>;
      const id = sanitizeSectionId(record.id);
      if (!id) return { ok: false, error: "invalid section id" };
      if (seenSectionIds.has(id)) return { ok: false, error: "duplicate section" };
      seenSectionIds.add(id);
      if (record.name !== undefined) {
        const name = sanitizeSectionName(record.name);
        if (!name) return { ok: false, error: "invalid section name" };
        sections.push({ id, name });
      } else {
        sections.push({ id });
      }
    }
  }
  for (const id of [
    ...PLUGIN_ORGANIZATION_BUILT_IN_SECTION_IDS,
    PLUGIN_ORGANIZATION_NONE_SECTION_ID,
  ]) {
    if (!seenSectionIds.has(id)) return { ok: false, error: `missing section: ${id}` };
    const section = sections.find((candidate) => candidate.id === id)!;
    if (id !== PLUGIN_ORGANIZATION_NONE_SECTION_ID) section.builtIn = true;
  }
  if (sections.length > PLUGIN_ORGANIZATION_LIMITS.maxSections) {
    return { ok: false, error: "too many sections" };
  }

  const items: Record<string, PluginOrganizationItem> = {};
  if (source.items !== undefined) {
    if (!source.items || typeof source.items !== "object" || Array.isArray(source.items)) {
      return { ok: false, error: "items must be an object" };
    }
    for (const [rawId, rawItem] of Object.entries(source.items)) {
      const pluginId = sanitizePluginId(rawId);
      if (!pluginId) return { ok: false, error: "invalid plugin id" };
      if (Object.keys(items).length >= PLUGIN_ORGANIZATION_LIMITS.maxItems) {
        return { ok: false, error: "too many items" };
      }
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
        return { ok: false, error: "invalid item entry" };
      }
      const record = rawItem as Record<string, unknown>;
      if (typeof record.section !== "string" || !seenSectionIds.has(record.section)) {
        return { ok: false, error: "invalid item section reference" };
      }
      if (typeof record.favorite !== "boolean" || typeof record.hidden !== "boolean") {
        return { ok: false, error: "invalid item flags" };
      }
      items[pluginId] = {
        section: record.section,
        favorite: record.favorite,
        hidden: record.hidden,
      };
    }
  }

  const sectionOrder: Record<string, string[]> = Object.fromEntries(
    sections.map((section) => [section.id, [] as string[]]),
  );
  if (source.sectionOrder !== undefined) {
    if (
      !source.sectionOrder ||
      typeof source.sectionOrder !== "object" ||
      Array.isArray(source.sectionOrder)
    ) {
      return { ok: false, error: "sectionOrder must be an object" };
    }
    for (const [rawSectionId, rawList] of Object.entries(source.sectionOrder)) {
      if (!seenSectionIds.has(rawSectionId)) {
        return { ok: false, error: "invalid sectionOrder section reference" };
      }
      if (!Array.isArray(rawList)) return { ok: false, error: "invalid sectionOrder list" };
      const seen = new Set<string>();
      for (const entry of rawList) {
        const pluginId = sanitizePluginId(entry);
        if (!pluginId) return { ok: false, error: "invalid sectionOrder plugin id" };
        if (seen.has(pluginId)) return { ok: false, error: "duplicate sectionOrder entry" };
        seen.add(pluginId);
        sectionOrder[rawSectionId].push(pluginId);
        items[pluginId] ??= {
          section: rawSectionId,
          favorite: false,
          hidden: false,
        };
      }
    }
  }

  // Cobertura: todo item aparece na lista da sua seção.
  for (const [pluginId, item] of Object.entries(items)) {
    const list = sectionOrder[item.section];
    if (!list) return { ok: false, error: "invalid item section reference" };
    if (!list.includes(pluginId)) list.push(pluginId);
  }

  return {
    ok: true,
    organization: {
      version: PLUGIN_ORGANIZATION_VERSION,
      sections,
      items,
      sectionOrder,
      cardSize,
    },
  };
}

/** Hash estável do estado canônico (mesmo valor no navegador e no servidor). */
export function pluginOrganizationRevision(organization: PluginOrganization): string {
  const canonical = canonicalizeForRevision(organization);
  const serialized = JSON.stringify(canonical);
  return cyrb53Hex(serialized);
}

function canonicalizeForRevision(organization: PluginOrganization): unknown {
  const normalized = normalizePluginOrganization(organization);
  const sections = [...normalized.sections].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const items: Record<string, PluginOrganizationItem> = {};
  for (const key of Object.keys(normalized.items).sort()) {
    items[key] = normalized.items[key];
  }
  const sectionOrder: Record<string, string[]> = {};
  for (const key of Object.keys(normalized.sectionOrder).sort()) {
    sectionOrder[key] = normalized.sectionOrder[key];
  }
  return {
    version: 1,
    sections,
    items,
    sectionOrder,
    cardSize: normalizePluginCardSize(normalized.cardSize),
  };
}

function cyrb53Hex(input: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

function removeFromAllOrderLists(organization: PluginOrganization, pluginId: string) {
  for (const list of Object.values(organization.sectionOrder)) {
    const index = list.indexOf(pluginId);
    if (index >= 0) list.splice(index, 1);
  }
}

/** Move o plugin entre seções (remover seção move itens para `none`). */
export function movePluginToSection(
  organization: PluginOrganization,
  pluginId: string,
  sectionId: string,
): PluginOrganization {
  const next = cloneOrganization(organization);
  if (!knownSectionIds(next).has(sectionId)) return next;
  const id = sanitizePluginId(pluginId);
  if (!id) return next;
  removeFromAllOrderLists(next, id);
  const item = next.items[id] ?? { section: sectionId, favorite: false, hidden: false };
  item.section = sectionId;
  next.items[id] = item;
  const list = (next.sectionOrder[sectionId] ??= []);
  if (!list.includes(id)) list.push(id);
  return next;
}

/**
 * Reordena os cards visíveis de uma seção sem apagar nem trocar a ordem dos
 * plugins invisíveis (filtros ativos): as posições invisíveis são preservadas
 * e os visíveis ocupam essas posições na nova ordem.
 */
export function reorderSectionPlugins(
  organization: PluginOrganization,
  sectionId: string,
  visibleOrderedIds: string[],
): PluginOrganization {
  const next = cloneOrganization(organization);
  const full = next.sectionOrder[sectionId];
  if (!full) return next;
  const sanitized = visibleOrderedIds
    .map((id) => sanitizePluginId(id))
    .filter((id): id is string => Boolean(id));
  const visible = new Set(sanitized);
  const queue = [...sanitized];
  const merged = full.map((id) => (visible.has(id) ? (queue.shift() ?? id) : id));
  for (const id of queue) {
    if (!merged.includes(id)) merged.push(id);
  }
  next.sectionOrder[sectionId] = merged;
  return next;
}

export function togglePluginFavorite(
  organization: PluginOrganization,
  pluginId: string,
): PluginOrganization {
  const next = cloneOrganization(organization);
  const id = sanitizePluginId(pluginId);
  if (!id) return next;
  const item = next.items[id] ?? {
    section: PLUGIN_ORGANIZATION_NONE_SECTION_ID,
    favorite: false,
    hidden: false,
  };
  item.favorite = !item.favorite;
  next.items[id] = item;
  const list = (next.sectionOrder[item.section] ??= []);
  if (!list.includes(id)) list.push(id);
  return next;
}

/**
 * Troca somente o tamanho dos cards, sem alterar seções, itens, ordem,
 * favoritos ou ocultos. Tamanho inválido mantém o estado inalterado.
 */
export function setPluginCardSize(
  organization: PluginOrganization,
  size: unknown,
): PluginOrganization {
  const next = cloneOrganization(organization);
  if (!isPluginCardSize(size)) return next;
  next.cardSize = size;
  return next;
}

export type OrganizationSectionMutation =
  | { ok: true; organization: PluginOrganization }
  | { ok: false; error: "invalid-name" | "duplicate" | "reserved" | "not-found" | "limit" };

export function createOrganizationSection(
  organization: PluginOrganization,
  name: string,
): OrganizationSectionMutation {
  const clean = sanitizeSectionName(name);
  if (!clean) return { ok: false, error: "invalid-name" };
  const next = cloneOrganization(organization);
  const known = knownSectionIds(next);
  if (next.sections.length >= PLUGIN_ORGANIZATION_LIMITS.maxSections) {
    return { ok: false, error: "limit" };
  }
  let base = slugifySectionName(clean) ?? "secao";
  if (
    (PLUGIN_ORGANIZATION_BUILT_IN_SECTION_IDS as readonly string[]).includes(base) ||
    base === PLUGIN_ORGANIZATION_NONE_SECTION_ID
  ) {
    base = `secao-${base}`;
  }
  let id = base;
  let attempt = 2;
  while (known.has(id)) {
    id = `${base}-${attempt}`;
    attempt += 1;
    if (attempt > 100) return { ok: false, error: "duplicate" };
  }
  next.sections.push({ id, name: clean });
  next.sectionOrder[id] = [];
  return { ok: true, organization: next };
}

export function renameOrganizationSection(
  organization: PluginOrganization,
  sectionId: string,
  name: string,
): OrganizationSectionMutation {
  if (sectionId === PLUGIN_ORGANIZATION_NONE_SECTION_ID) return { ok: false, error: "reserved" };
  const clean = sanitizeSectionName(name);
  if (!clean) return { ok: false, error: "invalid-name" };
  const next = cloneOrganization(organization);
  const section = next.sections.find((candidate) => candidate.id === sectionId);
  if (!section) return { ok: false, error: "not-found" };
  section.name = clean;
  return { ok: true, organization: next };
}

/** Remover seção não desinstala plugins: move os itens para `none`. */
export function removeOrganizationSection(
  organization: PluginOrganization,
  sectionId: string,
): OrganizationSectionMutation {
  if (
    sectionId === PLUGIN_ORGANIZATION_NONE_SECTION_ID ||
    (PLUGIN_ORGANIZATION_BUILT_IN_SECTION_IDS as readonly string[]).includes(sectionId)
  ) {
    return { ok: false, error: "reserved" };
  }
  const next = cloneOrganization(organization);
  const index = next.sections.findIndex((candidate) => candidate.id === sectionId);
  if (index < 0) return { ok: false, error: "not-found" };
  next.sections.splice(index, 1);
  const moved = next.sectionOrder[sectionId] ?? [];
  delete next.sectionOrder[sectionId];
  const noneList = (next.sectionOrder[PLUGIN_ORGANIZATION_NONE_SECTION_ID] ??= []);
  for (const pluginId of moved) {
    const item = next.items[pluginId];
    if (item) item.section = PLUGIN_ORGANIZATION_NONE_SECTION_ID;
    if (!noneList.includes(pluginId)) noneList.push(pluginId);
  }
  for (const item of Object.values(next.items)) {
    if (item.section === sectionId) item.section = PLUGIN_ORGANIZATION_NONE_SECTION_ID;
  }
  return { ok: true, organization: next };
}

export function organizationItemFor(
  organization: PluginOrganization,
  pluginId: string,
): PluginOrganizationItem {
  return (
    organization.items[pluginId] ?? {
      section: PLUGIN_ORGANIZATION_NONE_SECTION_ID,
      favorite: false,
      hidden: false,
    }
  );
}

/**
 * Lista de renderização: somente o inventário atual, na ordem persistida.
 * Plugins novos (sem referência) aparecem ao fim de `none`, sem gravação.
 * Referências a plugins ausentes são preservadas no estado, fora da tela.
 */
export function resolveSectionListing(
  organization: PluginOrganization,
  inventoryIds: string[],
): Record<string, string[]> {
  const inventory = new Set(inventoryIds);
  const listing: Record<string, string[]> = {};
  for (const section of organization.sections) {
    listing[section.id] = (organization.sectionOrder[section.id] ?? []).filter((id) =>
      inventory.has(id),
    );
  }
  const listed = new Set(Object.values(listing).flat());
  const unassigned = inventoryIds.filter((id) => !listed.has(id));
  listing[PLUGIN_ORGANIZATION_NONE_SECTION_ID] ??= [];
  for (const id of unassigned) {
    listing[PLUGIN_ORGANIZATION_NONE_SECTION_ID].push(id);
  }
  return listing;
}

export type OrganizationCardFilter = {
  sectionId: string | "all";
  favoritesOnly: boolean;
};

export function matchesOrganizationFilter(
  organization: PluginOrganization,
  pluginId: string,
  filter: OrganizationCardFilter,
): boolean {
  const item = organizationItemFor(organization, pluginId);
  if (filter.favoritesOnly && !item.favorite) return false;
  if (filter.sectionId !== "all" && item.section !== filter.sectionId) return false;
  return true;
}
