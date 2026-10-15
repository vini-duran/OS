import assert from "node:assert/strict";
import test from "node:test";

import {
  pluginOrganizationMessages,
  pluginOrganizationSectionLabel,
  pluginOrganizationText,
  type PluginOrganizationMessageKey,
} from "./plugin-organization-localization";

const keys = Object.keys(pluginOrganizationMessages) as PluginOrganizationMessageKey[];

test("todas as strings da organização existem em PT-BR, inglês e espanhol", () => {
  assert.ok(keys.length > 10);
  for (const key of keys) {
    const [pt, en, es] = pluginOrganizationMessages[key];
    assert.ok(pt.trim().length > 0, key);
    assert.ok(en.trim().length > 0, key);
    assert.ok(es.trim().length > 0, key);
    assert.equal(pluginOrganizationText(key, "pt-BR"), pt);
    assert.equal(pluginOrganizationText(key, "en"), en);
    assert.equal(pluginOrganizationText(key, "es"), es);
  }
});

test("traduções de inglês e espanhol diferem do PT-BR quando há texto próprio", () => {
  for (const key of ["createSection", "saveFailed", "saveConflict"] as const) {
    const [pt, en, es] = pluginOrganizationMessages[key];
    assert.notEqual(en, pt, key);
    assert.notEqual(es, pt, key);
  }
  // "Organizar biblioteca" tem a mesma grafia em PT-BR e espanhol; inglês difere.
  assert.notEqual(
    pluginOrganizationMessages.organizeLibrary[1],
    pluginOrganizationMessages.organizeLibrary[0],
  );
});

test("rótulos das seções padrão são traduzidos; nomes de usuário não", () => {
  assert.equal(pluginOrganizationSectionLabel("generation", undefined, "pt-BR"), "Geração");
  assert.equal(pluginOrganizationSectionLabel("generation", undefined, "en"), "Generation");
  assert.equal(pluginOrganizationSectionLabel("generation", undefined, "es"), "Generación");
  assert.equal(pluginOrganizationSectionLabel("editing", undefined, "en"), "Editing");
  assert.equal(pluginOrganizationSectionLabel("publishing", undefined, "es"), "Publicación");
  assert.equal(pluginOrganizationSectionLabel("utilities", undefined, "pt-BR"), "Utilidades");
  assert.equal(pluginOrganizationSectionLabel("none", undefined, "pt-BR"), "Sem seção");
  assert.equal(pluginOrganizationSectionLabel("none", undefined, "en"), "No section");
  assert.equal(pluginOrganizationSectionLabel("none", undefined, "es"), "Sin sección");
  // Nome editado pelo usuário nunca é traduzido.
  for (const language of ["pt-BR", "en", "es"] as const) {
    assert.equal(
      pluginOrganizationSectionLabel("generation", "Minha geração", language),
      "Minha geração",
    );
    assert.equal(
      pluginOrganizationSectionLabel("minha-secao", "Minha seção", language),
      "Minha seção",
    );
  }
});
