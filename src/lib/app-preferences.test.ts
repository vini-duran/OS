import assert from "node:assert/strict";
import test from "node:test";

import { translate } from "./app-preferences";

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
    assert.notEqual(translate(phrase, "es"), phrase);
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
