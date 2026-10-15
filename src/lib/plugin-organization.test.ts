import assert from "node:assert/strict";
import test from "node:test";

import {
  PLUGIN_ORGANIZATION_NONE_SECTION_ID,
  createOrganizationSection,
  defaultPluginOrganization,
  matchesOrganizationFilter,
  movePluginToSection,
  normalizePluginOrganization,
  pluginOrganizationRevision,
  removeOrganizationSection,
  renameOrganizationSection,
  reorderSectionPlugins,
  resolveSectionListing,
  setPluginCardSize,
  togglePluginFavorite,
  validatePluginOrganizationForWrite,
} from "./plugin-organization";

test("normaliza o formato histórico preservando itens e ordem", () => {
  const historic = {
    items: {
      "plugin-a": { section: "generation", favorite: true, hidden: false },
      "plugin-b": { section: "none", favorite: false, hidden: true },
    },
    sectionOrder: {
      generation: ["plugin-a"],
      editing: [],
      publishing: [],
      utilities: [],
      none: ["plugin-b", "plugin-a"],
    },
  };
  const normalized = normalizePluginOrganization(historic);
  assert.equal(normalized.version, 1);
  assert.deepEqual(
    normalized.sections.map((section) => section.id),
    ["generation", "editing", "publishing", "utilities", "none"],
  );
  assert.equal(normalized.items["plugin-a"].favorite, true);
  // Oculto histórico continua marcado, sem sumir do estado.
  assert.equal(normalized.items["plugin-b"].hidden, true);
  assert.deepEqual(normalized.sectionOrder.generation, ["plugin-a"]);
  assert.ok(normalized.sectionOrder.none.includes("plugin-b"));
});

test("normalize repara seção desconhecida movendo para none sem apagar referência", () => {
  const normalized = normalizePluginOrganization({
    items: { "plugin-x": { section: "extinta", favorite: false, hidden: false } },
    sectionOrder: { extinta: ["plugin-x"] },
  });
  assert.equal(normalized.items["plugin-x"].section, "none");
  assert.ok(normalized.sectionOrder.none.includes("plugin-x"));
});

test("novos plugins aparecem ao fim de none somente na renderização", () => {
  const organization = defaultPluginOrganization();
  const listing = resolveSectionListing(organization, ["plugin-novo", "plugin-antigo"]);
  assert.deepEqual(listing.none, ["plugin-novo", "plugin-antigo"]);
  // Sem gravação automática: o estado continua sem o item.
  assert.equal("plugin-novo" in organization.items, false);
});

test("renderização usa só o inventário atual e preserva ausentes no estado", () => {
  const organization = movePluginToSection(
    defaultPluginOrganization(),
    "plugin-ausente",
    "editing",
  );
  const listing = resolveSectionListing(organization, ["plugin-atual"]);
  assert.ok(!Object.values(listing).flat().includes("plugin-ausente"));
  assert.ok(listing.none.includes("plugin-atual"));
  assert.equal(organization.items["plugin-ausente"].section, "editing");
});

test("reordenar com filtros não apaga nem troca invisíveis", () => {
  let organization = defaultPluginOrganization();
  for (const id of ["a", "b", "c", "d"]) {
    organization = movePluginToSection(organization, id, "generation");
  }
  // Filtro esconde "b" e "d": só a, c visíveis; usuário arrasta c para frente.
  const reordered = reorderSectionPlugins(organization, "generation", ["c", "a"]);
  const list = reordered.sectionOrder.generation;
  // Ordem visível relativa = c antes de a; invisíveis b, d mantêm posições relativas.
  assert.ok(list.indexOf("c") < list.indexOf("a"));
  assert.ok(list.indexOf("b") < list.indexOf("d"));
  assert.deepEqual([...list].sort(), ["a", "b", "c", "d"]);
});

test("remover seção preserva todos os plugins em none", () => {
  let organization = defaultPluginOrganization();
  const created = createOrganizationSection(organization, "Narração");
  assert.equal(created.ok, true);
  if (!created.ok) return;
  organization = created.organization;
  const sectionId = organization.sections[organization.sections.length - 1].id;
  organization = movePluginToSection(organization, "plugin-a", sectionId);
  organization = movePluginToSection(organization, "plugin-b", sectionId);
  const removed = removeOrganizationSection(organization, sectionId);
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  assert.equal(removed.organization.items["plugin-a"].section, "none");
  assert.equal(removed.organization.items["plugin-b"].section, "none");
  assert.ok(removed.organization.sectionOrder.none.includes("plugin-a"));
  assert.ok(removed.organization.sectionOrder.none.includes("plugin-b"));
  assert.equal(
    removed.organization.sections.some((section) => section.id === sectionId),
    false,
  );
});

test("seções reservadas não podem ser removidas nem none renomeado", () => {
  const organization = defaultPluginOrganization();
  assert.equal(removeOrganizationSection(organization, "generation").ok, false);
  assert.equal(removeOrganizationSection(organization, "none").ok, false);
  assert.equal(renameOrganizationSection(organization, "none", "Outro").ok, false);
  const renamed = renameOrganizationSection(organization, "generation", "Minha geração");
  assert.equal(renamed.ok, true);
});

test("favoritos e filtros por seção funcionam juntos", () => {
  let organization = defaultPluginOrganization();
  organization = movePluginToSection(organization, "plugin-a", "editing");
  organization = togglePluginFavorite(organization, "plugin-a");
  organization = movePluginToSection(organization, "plugin-b", "editing");
  assert.equal(
    matchesOrganizationFilter(organization, "plugin-a", {
      sectionId: "editing",
      favoritesOnly: true,
    }),
    true,
  );
  assert.equal(
    matchesOrganizationFilter(organization, "plugin-b", {
      sectionId: "editing",
      favoritesOnly: true,
    }),
    false,
  );
  assert.equal(
    matchesOrganizationFilter(organization, "plugin-b", {
      sectionId: "all",
      favoritesOnly: false,
    }),
    true,
  );
});

test("validação estrita rejeita duplicadas e referências inválidas", () => {
  const base = normalizePluginOrganization({
    items: { "plugin-a": { section: "generation", favorite: false, hidden: false } },
    sectionOrder: { generation: ["plugin-a"] },
  });
  assert.equal(validatePluginOrganizationForWrite(base).ok, true);

  const duplicated = structuredClone(base);
  duplicated.sections.push({ id: "generation" });
  assert.equal(validatePluginOrganizationForWrite(duplicated).ok, false);

  const badRef = structuredClone(base);
  badRef.items["plugin-b"] = { section: "inexistente", favorite: false, hidden: false };
  assert.equal(validatePluginOrganizationForWrite(badRef).ok, false);

  const badOrder = structuredClone(base);
  badOrder.sectionOrder = { inexistente: ["plugin-a"] };
  assert.equal(validatePluginOrganizationForWrite(badOrder).ok, false);

  assert.equal(validatePluginOrganizationForWrite({ items: [] }).ok, false);
  // Prototype pollution via chave própria __proto__ (como entrega JSON.parse) é rejeitada.
  const polluted = JSON.parse(
    '{"version":1,"sections":[{"id":"generation"},{"id":"editing"},{"id":"publishing"},{"id":"utilities"},{"id":"none"}],"items":{"__proto__":{"section":"generation","favorite":false,"hidden":false}},"sectionOrder":{"generation":[],"editing":[],"publishing":[],"utilities":[],"none":[]}}',
  ) as unknown;
  assert.equal(validatePluginOrganizationForWrite(polluted).ok, false);
  // Normalização tolerante também ignora a chave sem poluir o protótipo.
  const normalizedPolluted = normalizePluginOrganization(polluted);
  assert.equal(Object.hasOwn(normalizedPolluted.items, "__proto__"), false);
  assert.equal(Object.hasOwn({}, "section"), false);
});

test("revision é estável e muda com o estado canônico", () => {
  const first = normalizePluginOrganization({
    items: { "plugin-a": { section: "generation", favorite: false, hidden: false } },
    sectionOrder: { generation: ["plugin-a"] },
  });
  const reorderedKeys = normalizePluginOrganization({
    sectionOrder: { generation: ["plugin-a"] },
    items: { "plugin-a": { section: "generation", favorite: false, hidden: false } },
  });
  assert.equal(pluginOrganizationRevision(first), pluginOrganizationRevision(reorderedKeys));
  const changed = togglePluginFavorite(first, "plugin-a");
  assert.notEqual(pluginOrganizationRevision(first), pluginOrganizationRevision(changed));
  assert.equal(
    pluginOrganizationRevision(defaultPluginOrganization()),
    pluginOrganizationRevision(defaultPluginOrganization()),
  );
});

test("mover plugin entre seções atualiza item e ordem", () => {
  let organization = defaultPluginOrganization();
  organization = movePluginToSection(organization, "plugin-a", "generation");
  organization = movePluginToSection(organization, "plugin-a", "publishing");
  assert.equal(organization.items["plugin-a"].section, "publishing");
  assert.ok(!organization.sectionOrder.generation.includes("plugin-a"));
  assert.ok(organization.sectionOrder.publishing.includes("plugin-a"));
});

test("none reservado existe sempre após normalizar entrada vazia", () => {
  for (const raw of [undefined, null, {}, { sections: [] }, "texto"]) {
    const normalized = normalizePluginOrganization(raw);
    assert.ok(
      normalized.sections.some((section) => section.id === PLUGIN_ORGANIZATION_NONE_SECTION_ID),
    );
    assert.ok(Array.isArray(normalized.sectionOrder[PLUGIN_ORGANIZATION_NONE_SECTION_ID]));
  }
});

test("cardSize padrão é medium e legado ausente normaliza para medium", () => {
  assert.equal(defaultPluginOrganization().cardSize, "medium");
  const legacy = normalizePluginOrganization({
    items: { "plugin-a": { section: "generation", favorite: false, hidden: false } },
    sectionOrder: { generation: ["plugin-a"] },
  });
  assert.equal(legacy.cardSize, "medium");
  assert.equal(legacy.items["plugin-a"].section, "generation");
});

test("cardSize válido é preservado; inválido normaliza sem perder o resto", () => {
  const large = normalizePluginOrganization({ cardSize: "large" });
  assert.equal(large.cardSize, "large");
  const invalid = normalizePluginOrganization({
    cardSize: "gigante",
    items: { "plugin-a": { section: "editing", favorite: true, hidden: false } },
    sectionOrder: { editing: ["plugin-a"] },
  });
  assert.equal(invalid.cardSize, "medium");
  assert.equal(invalid.items["plugin-a"].section, "editing");
  assert.equal(invalid.items["plugin-a"].favorite, true);
});

test("todas as mutações preservam cardSize; trocar tamanho não altera o resto", () => {
  const sized = setPluginCardSize(defaultPluginOrganization(), "large");
  assert.equal(sized.cardSize, "large");
  const moved = movePluginToSection(sized, "plugin-a", "editing");
  assert.equal(moved.cardSize, "large");
  const favored = togglePluginFavorite(moved, "plugin-a");
  assert.equal(favored.cardSize, "large");
  const reordered = reorderSectionPlugins(favored, "editing", ["plugin-a"]);
  assert.equal(reordered.cardSize, "large");
  const renamed = renameOrganizationSection(reordered, "editing", "Minha edição");
  assert.equal(renamed.ok, true);
  if (renamed.ok) assert.equal(renamed.organization.cardSize, "large");
  const created = createOrganizationSection(reordered, "Extra");
  assert.equal(created.ok, true);
  if (created.ok) assert.equal(created.organization.cardSize, "large");

  const before = movePluginToSection(
    setPluginCardSize(defaultPluginOrganization(), "small"),
    "plugin-a",
    "generation",
  );
  const snapshot = structuredClone(before);
  const after = setPluginCardSize(before, "large");
  assert.equal(after.cardSize, "large");
  assert.deepEqual(after.sections, snapshot.sections);
  assert.deepEqual(after.items, snapshot.items);
  assert.deepEqual(after.sectionOrder, snapshot.sectionOrder);

  const kept = setPluginCardSize(before, "inválido");
  assert.equal(kept.cardSize, "small");
  assert.deepEqual(kept.items, before.items);
});

test("validação de escrita aceita ausente como medium e rejeita inválido", () => {
  const base = normalizePluginOrganization({});
  assert.equal(validatePluginOrganizationForWrite(base).ok, true);
  const without = structuredClone(base) as Record<string, unknown>;
  delete without.cardSize;
  const accepted = validatePluginOrganizationForWrite(without);
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.equal(accepted.organization.cardSize, "medium");
  const bad = { ...structuredClone(base), cardSize: "gigante" };
  assert.equal(validatePluginOrganizationForWrite(bad).ok, false);
});

test("revision muda quando só o cardSize muda", () => {
  const base = defaultPluginOrganization();
  const large = setPluginCardSize(base, "large");
  assert.notEqual(pluginOrganizationRevision(base), pluginOrganizationRevision(large));
  assert.equal(
    pluginOrganizationRevision(base),
    pluginOrganizationRevision(defaultPluginOrganization()),
  );
});
