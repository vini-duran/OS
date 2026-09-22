import assert from "node:assert/strict";
import test from "node:test";

import {
  PLUGIN_SECTIONS,
  movePluginInSection,
  normalizePluginOrganization,
  organizePluginList,
  setPluginHidden,
  setPluginSection,
  togglePluginFavorite,
  translate,
  type PluginLibraryOrganization,
} from "./app-preferences";

test("component resources and unavailable catalog messages support all application languages", () => {
  for (const [phrase, english, spanish] of [
    ["Consultar plugins", "Browse plugins", "Consultar plugins"],
    ["Configurar Browser Bridge", "Set up Browser Bridge", "Configurar Browser Bridge"],
    ["Consultar skill de plugins", "Consult plugin skill", "Consultar skill de plugins"],
    ["Consultar skill de Métodos", "Consult Methods skill", "Consultar skill de Métodos"],
    [
      "Atualizações por catálogo indisponíveis. Você pode atualizar por pasta.",
      "Catalog updates are unavailable. You can update from a folder.",
      "Las actualizaciones por catálogo no están disponibles. Puedes actualizar desde una carpeta.",
    ],
    [
      "Consulte os componentes e suas instruções. Instale somente os plugins que você precisa pela opção Instalar plugin.",
      "Consult the components and their instructions. Install only the plugins you need using Install plugin.",
      "Consulta los componentes y sus instrucciones. Instala solo los plugins que necesitas con la opción Instalar plugin.",
    ],
    [
      "Use o agente guiado ou consulte a skill para trabalhar com seu agente de IA.",
      "Use the guided agent or consult the skill to work with your AI agent.",
      "Usa el agente guiado o consulta la skill para trabajar con tu agente de IA.",
    ],
  ]) {
    assert.equal(translate(phrase, "pt-BR"), phrase);
    assert.equal(translate(phrase, "en"), english);
    assert.equal(translate(phrase, "es"), spanish);
  }
});

test("restored research UI supports all application languages", () => {
  const phrases = [
    "Pesquisa estratégica",
    "Executar pesquisa",
    "Gerar brief",
    "Configure a conexão do plugin de pesquisa.",
  ];
  for (const phrase of phrases) {
    assert.equal(translate(phrase, "pt-BR"), phrase);
    assert.notEqual(translate(phrase, "en"), phrase);
  }
});

test("translates recently added Methods and plugin profile UI in English", () => {
  assert.equal(
    translate("Use, compartilhe e gerencie Métodos salvos nos seus canais", "en"),
    "Use, share, and manage Methods saved in your channels",
  );
  assert.equal(
    translate("Buscar por nome, Canal, processo ou ação...", "en"),
    "Search by name, Channel, process, or action...",
  );
  assert.equal(translate("5 de 8 processos configurados", "en"), "5 of 8 processes configured");
  assert.equal(translate("2 perfis", "en"), "2 profiles");
  assert.equal(translate("Acessar a internet", "en"), "Access the internet");
  assert.equal(translate(", entrega “theme”", "en"), ", output “theme”");
});

test("translates recently added Methods and plugin profile UI in Spanish", () => {
  assert.equal(
    translate("Use, compartilhe e gerencie Métodos salvos nos seus canais", "es"),
    "Usa, comparte y gestiona los Métodos guardados en tus canales",
  );
  assert.equal(
    translate("Buscar por nome, Canal, processo ou ação...", "es"),
    "Buscar por nombre, Canal, proceso o acción...",
  );
  assert.equal(translate("5 de 8 processos configurados", "es"), "5 de 8 procesos configurados");
  assert.equal(translate("2 perfis", "es"), "2 perfiles");
  assert.equal(translate("Acessar a internet", "es"), "Acceder a Internet");
  assert.equal(translate(", entrega “theme”", "es"), ", salida “theme”");
});

test("translates the MCP Method builder connection UI", () => {
  assert.equal(translate("Conectar agente via MCP", "en"), "Connect agent via MCP");
  assert.equal(translate("Conectar agente via MCP", "es"), "Conectar agente mediante MCP");
  assert.equal(
    translate("Configuração do servidor MCP local", "en"),
    "Local MCP server configuration",
  );
  assert.equal(translate("Copiar configuração", "es"), "Copiar configuración");
  assert.equal(translate("Preparando configuração MCP...", "en"), "Preparing MCP configuration...");
  assert.equal(
    translate(
      "Use esta configuração em qualquer agente compatível com MCP. O ContentFlow precisa permanecer aberto durante a criação e os testes dos Métodos.",
      "es",
    ),
    "Usa esta configuración con cualquier agente compatible con MCP. ContentFlow debe permanecer abierto durante la creación y las pruebas de los Métodos.",
  );
});

test("translates plugin credential management in English and Spanish", () => {
  assert.equal(translate("Credenciais e conexões", "en"), "Credentials and connections");
  assert.equal(translate("Credenciais e conexões", "es"), "Credenciales y conexiones");
  assert.equal(translate("1 conexão", "en"), "1 connection");
  assert.equal(translate("2 conexões", "es"), "2 conexiones");
  assert.equal(translate("1 de 4 credenciais configuradas", "en"), "1 of 4 credentials configured");
  assert.equal(
    translate("1 de 4 credenciais configuradas", "es"),
    "1 de 4 credenciales configuradas",
  );
  assert.equal(
    translate("Preencha somente as credenciais necessárias para esta conexão.", "en"),
    "Fill in only the credentials needed for this connection.",
  );
});

test("translates the unified block configuration labels", () => {
  assert.equal(translate("Iniciar minimizado", "en"), "Start minimized");
  assert.equal(translate("Iniciar minimizado", "es"), "Iniciar minimizado");
  assert.deepEqual(
    ["Nome da ação", "Prompt do bloco", "Operador responsável", "Informações de entrada"].map(
      (label) => translate(label, "en"),
    ),
    ["Action name", "Block prompt", "Responsible operator", "Input information"],
  );
  assert.deepEqual(
    ["Nome da ação", "Prompt do bloco", "Operador responsável", "Resultado desta ação"].map(
      (label) => translate(label, "es"),
    ),
    [
      "Nombre de la acción",
      "Prompt del bloque",
      "Operador responsable",
      "Resultado de esta acción",
    ],
  );
  assert.equal(
    translate("Defina apenas as entradas adicionais que esta ação precisa.", "en"),
    "Define only the additional inputs this action needs.",
  );
  assert.equal(
    translate("Cada entrega fica disponível para os próximos blocos.", "es"),
    "Cada salida queda disponible para los bloques siguientes.",
  );
});

test("preserves user-created and plugin-authored content", () => {
  for (const language of ["en", "es"] as const) {
    assert.equal(translate("Históricos Contentflow", language), "Históricos Contentflow");
    assert.equal(translate("Tipos de aberturas/ganchos", language), "Tipos de aberturas/ganchos");
    assert.equal(
      translate("Automação modular criada pelo autor do plugin.", language),
      "Automação modular criada pelo autor do plugin.",
    );
  }
});

test("translates the compact plugin contract validator", () => {
  assert.equal(translate("Plugin executor", "en"), "Runner plugin");
  assert.equal(translate("Requer ajustes", "es"), "Requiere ajustes");
  assert.equal(translate("Entrada · Sequência de prompts", "en"), "Input · Sequência de prompts");
  assert.equal(translate("Parâmetros do prompt (2)", "es"), "Parámetros del prompt (2)");
  assert.equal(translate("Prévia do envio à IA", "en"), "AI delivery preview");
  assert.equal(translate("Prévia do envio à IA", "es"), "Vista previa del envío a la IA");
});

test("translates execution attention and error notifications", () => {
  assert.equal(translate("Pendências e erros", "en"), "Tasks and errors");
  assert.equal(translate("Pendências e erros", "es"), "Tareas y errores");
  assert.equal(
    translate("2 erros de execução e 3 tarefas humanas pendentes", "en"),
    "2 execution errors and 3 pending human tasks",
  );
  assert.equal(
    translate("2 erros de execução e 3 tarefas humanas pendentes", "es"),
    "2 errores de ejecución y 3 tareas humanas pendientes",
  );
  assert.equal(
    translate("Pendências e erros na barra de tarefas", "en"),
    "Tasks and errors on the taskbar",
  );
  assert.equal(
    translate("Pendências e erros na barra de tarefas", "es"),
    "Tareas y errores en la barra de tareas",
  );
});

test("translates plugin library organization UI in English and Spanish", () => {
  const phrases = [
    "Favoritos",
    "Geração",
    "Utilitários",
    "Sem seção",
    "Organizar biblioteca",
    "Gerenciar biblioteca",
    "Mostrar ocultos",
    "Ocultar da biblioteca",
    "Exibir na biblioteca",
    "Exibir plugins ocultos",
    "Todas as seções",
  ];
  for (const phrase of phrases) {
    assert.equal(translate(phrase, "pt-BR"), phrase);
    assert.notEqual(translate(phrase, "en"), phrase);
  }
  assert.equal(translate("Favoritos", "en"), "Favorites");
  assert.equal(translate("Favoritos", "es"), "Favoritos");
  assert.equal(translate("Geração", "en"), "Generation");
  assert.equal(translate("Geração", "es"), "Generación");
  assert.equal(translate("Sem seção", "en"), "No section");
  assert.equal(translate("Sem seção", "es"), "Sin sección");
  assert.equal(translate("Mostrar ocultos", "en"), "Show hidden");
  assert.equal(translate("Mostrar ocultos", "es"), "Mostrar ocultos");
  assert.equal(translate("Exibir plugins ocultos", "en"), "Show hidden plugins");
  assert.equal(translate("Exibir plugins ocultos", "es"), "Mostrar plugins ocultos");
});

test("normalizePluginOrganization handles empty, null, and non-object inputs", () => {
  const emptyDefaults = [undefined, null, "", 42, [], {}];
  for (const input of emptyDefaults) {
    const result = normalizePluginOrganization(input);
    assert.deepEqual(result.items, {});
    for (const section of PLUGIN_SECTIONS) {
      assert.ok(Array.isArray(result.sectionOrder[section]));
      assert.equal(result.sectionOrder[section].length, 0);
    }
  }
});

test("normalizePluginOrganization sanitizes IDs and normalizes invalid sections", () => {
  const input = {
    items: {
      "  valid-plugin-1  ": { section: "generation", favorite: true, hidden: false },
      "": { section: "editing" },
      "   ": { section: "publishing" },
      "plugin-invalid-sec": { section: "invalid-section-name", favorite: "yes", hidden: null },
    },
    sectionOrder: {
      generation: ["  valid-plugin-1  ", "valid-plugin-1"],
      invalid: ["foo"],
    },
  };

  const normalized = normalizePluginOrganization(input);
  assert.ok("valid-plugin-1" in normalized.items);
  assert.equal(normalized.items["valid-plugin-1"].section, "generation");
  assert.equal(normalized.items["valid-plugin-1"].favorite, true);
  assert.equal(normalized.items["valid-plugin-1"].hidden, false);

  assert.ok(!("" in normalized.items));
  assert.ok(!("   " in normalized.items));

  assert.ok("plugin-invalid-sec" in normalized.items);
  assert.equal(normalized.items["plugin-invalid-sec"].section, "none");
  assert.equal(normalized.items["plugin-invalid-sec"].favorite, true);
  assert.equal(normalized.items["plugin-invalid-sec"].hidden, false);

  // Check sectionOrder deduplication
  assert.deepEqual(normalized.sectionOrder.generation, ["valid-plugin-1"]);
  assert.ok(normalized.sectionOrder.none.includes("plugin-invalid-sec"));
});

test("normalizePluginOrganization migrates legacy format with favorites, hidden, and sections", () => {
  const legacy = {
    favorites: ["plugin-a", "plugin-b"],
    hidden: ["plugin-c"],
    sections: {
      generation: ["plugin-a"],
      editing: ["plugin-b", "plugin-c"],
      publishing: ["plugin-d"],
    },
  };

  const normalized = normalizePluginOrganization(legacy);

  assert.equal(normalized.items["plugin-a"].section, "generation");
  assert.equal(normalized.items["plugin-a"].favorite, true);
  assert.equal(normalized.items["plugin-a"].hidden, false);

  assert.equal(normalized.items["plugin-b"].section, "editing");
  assert.equal(normalized.items["plugin-b"].favorite, true);
  assert.equal(normalized.items["plugin-b"].hidden, false);

  assert.equal(normalized.items["plugin-c"].section, "editing");
  assert.equal(normalized.items["plugin-c"].favorite, false);
  assert.equal(normalized.items["plugin-c"].hidden, true);

  assert.equal(normalized.items["plugin-d"].section, "publishing");
  assert.equal(normalized.items["plugin-d"].favorite, false);
  assert.equal(normalized.items["plugin-d"].hidden, false);

  assert.deepEqual(normalized.sectionOrder.generation, ["plugin-a"]);
  assert.deepEqual(normalized.sectionOrder.editing, ["plugin-b", "plugin-c"]);
  assert.deepEqual(normalized.sectionOrder.publishing, ["plugin-d"]);
});

test("togglePluginFavorite toggles favorite state and handles unconfigured IDs", () => {
  let org: PluginLibraryOrganization = normalizePluginOrganization(null);

  org = togglePluginFavorite(org, "plugin-1");
  assert.equal(org.items["plugin-1"].favorite, true);
  assert.equal(org.items["plugin-1"].section, "none");

  org = togglePluginFavorite(org, "plugin-1");
  assert.equal(org.items["plugin-1"].favorite, false);

  // Invalid IDs are no-ops
  const unchanged = togglePluginFavorite(org, "   ");
  assert.deepEqual(unchanged, org);
});

test("setPluginSection moves plugin between sections and updates sectionOrder", () => {
  let org: PluginLibraryOrganization = normalizePluginOrganization({
    items: {
      p1: { section: "none", favorite: false, hidden: false },
      p2: { section: "none", favorite: false, hidden: false },
    },
    sectionOrder: {
      none: ["p1", "p2"],
    },
  });

  org = setPluginSection(org, "p1", "generation");
  assert.equal(org.items.p1.section, "generation");
  assert.deepEqual(org.sectionOrder.generation, ["p1"]);
  assert.deepEqual(org.sectionOrder.none, ["p2"]);

  // Setting invalid section defaults to 'none'
  org = setPluginSection(org, "p1", "invalid-sec" as any);
  assert.equal(org.items.p1.section, "none");
  assert.deepEqual(org.sectionOrder.generation, []);
  assert.ok(org.sectionOrder.none.includes("p1"));
});

test("movePluginInSection swaps positions and respects boundary limits", () => {
  let org: PluginLibraryOrganization = normalizePluginOrganization({
    items: {
      a: { section: "generation", favorite: false, hidden: false },
      b: { section: "generation", favorite: false, hidden: false },
      c: { section: "generation", favorite: false, hidden: false },
    },
    sectionOrder: {
      generation: ["a", "b", "c"],
    },
  });

  // Moving first item up is a no-op
  const topNoop = movePluginInSection(org, "a", "up");
  assert.deepEqual(topNoop.sectionOrder.generation, ["a", "b", "c"]);

  // Moving second item up swaps with first
  org = movePluginInSection(org, "b", "up");
  assert.deepEqual(org.sectionOrder.generation, ["b", "a", "c"]);

  // Moving last item down is a no-op
  const bottomNoop = movePluginInSection(org, "c", "down");
  assert.deepEqual(bottomNoop.sectionOrder.generation, ["b", "a", "c"]);

  // Moving middle item down swaps with successor
  org = movePluginInSection(org, "a", "down");
  assert.deepEqual(org.sectionOrder.generation, ["b", "c", "a"]);

  // Moving nonexistent plugin is a no-op
  const missingNoop = movePluginInSection(org, "nonexistent", "up");
  assert.deepEqual(missingNoop.sectionOrder.generation, ["b", "c", "a"]);
});

test("setPluginHidden updates hidden state without changing section or order", () => {
  let org: PluginLibraryOrganization = normalizePluginOrganization({
    items: {
      p1: { section: "utilities", favorite: true, hidden: false },
    },
    sectionOrder: {
      utilities: ["p1"],
    },
  });

  org = setPluginHidden(org, "p1", true);
  assert.equal(org.items.p1.hidden, true);
  assert.equal(org.items.p1.section, "utilities");
  assert.equal(org.items.p1.favorite, true);
  assert.deepEqual(org.sectionOrder.utilities, ["p1"]);

  org = setPluginHidden(org, "p1", false);
  assert.equal(org.items.p1.hidden, false);
});

test("organizePluginList organizes favorites, sections, hidden items, and dependencies", () => {
  const plugins = [
    { id: "gen-2", manifest: { name: "Gen B" }, methodDependencyCount: 0 },
    { id: "gen-1", manifest: { name: "Gen A" }, methodDependencyCount: 2 },
    { id: "edit-1", manifest: { name: "Editor" }, methodDependencyCount: 0 },
    { id: "hid-in-use", manifest: { name: "Hidden In Use" }, methodDependencyCount: 1 },
    { id: "hid-normal", manifest: { name: "Hidden Normal" }, methodDependencyCount: 0 },
    { id: "new-unconfigured", manifest: { name: "Unconfigured" }, methodDependencyCount: 0 },
  ];

  const org: PluginLibraryOrganization = normalizePluginOrganization({
    items: {
      "gen-1": { section: "generation", favorite: true, hidden: false },
      "gen-2": { section: "generation", favorite: false, hidden: false },
      "edit-1": { section: "editing", favorite: true, hidden: false },
      "hid-in-use": { section: "utilities", favorite: false, hidden: true },
      "hid-normal": { section: "none", favorite: false, hidden: true },
    },
    sectionOrder: {
      generation: ["gen-2", "gen-1"], // Manual order: gen-2 before gen-1
      editing: ["edit-1"],
      utilities: ["hid-in-use"],
      none: ["hid-normal"],
    },
  });

  // Default view: showHidden = false
  const standard = organizePluginList(plugins, org, { showHidden: false });

  // Favorites: gen-1 and edit-1
  assert.equal(standard.favorites.length, 2);
  assert.ok(standard.favorites.some((p) => p.id === "gen-1"));
  assert.ok(standard.favorites.some((p) => p.id === "edit-1"));

  // Generation section preserves manual order (gen-2 before gen-1)
  assert.deepEqual(
    standard.sections.generation.map((p) => p.id),
    ["gen-2", "gen-1"],
  );

  // Editing section
  assert.deepEqual(
    standard.sections.editing.map((p) => p.id),
    ["edit-1"],
  );

  // Hidden plugins omitted from normal sections
  assert.equal(standard.sections.utilities.length, 0);

  // Unconfigured plugin automatically placed in "none"
  assert.deepEqual(
    standard.sections.none.map((p) => p.id),
    ["new-unconfigured"],
  );

  // Hidden counters
  assert.equal(standard.hiddenCount, 2);
  assert.equal(standard.hiddenWithDependenciesCount, 1); // hid-in-use is used by methods

  // When showHidden = true: hidden plugins are visible
  const withHidden = organizePluginList(plugins, org, { showHidden: true });
  assert.equal(withHidden.sections.utilities.length, 1);
  assert.equal(withHidden.sections.utilities[0].id, "hid-in-use");
  assert.ok(withHidden.sections.none.some((p) => p.id === "hid-normal"));

  // Section filter for 'favorites'
  const favOnly = organizePluginList(plugins, org, { sectionFilter: "favorites" });
  assert.equal(favOnly.favorites.length, 2);
  assert.equal(favOnly.sections.generation.length, 0);

  // Section filter for 'generation'
  const genOnly = organizePluginList(plugins, org, { sectionFilter: "generation" });
  assert.equal(genOnly.favorites.length, 0);
  assert.equal(genOnly.sections.generation.length, 2);
  assert.equal(genOnly.sections.editing.length, 0);
});
