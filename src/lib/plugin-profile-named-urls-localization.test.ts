import assert from "node:assert/strict";
import test from "node:test";
import {
  pluginProfileNamedUrlsMessages,
  pluginProfileNamedUrlsText,
  type PluginProfileNamedUrlsMessageKey,
} from "./plugin-profile-named-urls-localization";

const keys = Object.keys(pluginProfileNamedUrlsMessages) as PluginProfileNamedUrlsMessageKey[];

test("todas as strings de projetos do perfil existem em PT-BR, inglês e espanhol", () => {
  assert.ok(keys.length >= 10);
  for (const key of keys) {
    const [pt, en, es] = pluginProfileNamedUrlsMessages[key];
    assert.ok(pt.trim().length > 0, key);
    assert.ok(en.trim().length > 0, key);
    assert.ok(es.trim().length > 0, key);
    assert.equal(pluginProfileNamedUrlsText(key, "pt-BR"), pt);
    assert.equal(pluginProfileNamedUrlsText(key, "en"), en);
    assert.equal(pluginProfileNamedUrlsText(key, "es"), es);
  }
});

test("rótulos canônicos do Stage 1 estão presentes", () => {
  assert.equal(pluginProfileNamedUrlsText("profileProjects", "pt-BR"), "Projetos deste perfil");
  assert.equal(pluginProfileNamedUrlsText("addUrl", "pt-BR"), "Adicionar URL");
  assert.equal(pluginProfileNamedUrlsText("projectName", "pt-BR"), "Nome do projeto");
  assert.equal(pluginProfileNamedUrlsText("projectUrl", "pt-BR"), "URL do projeto");
  assert.equal(pluginProfileNamedUrlsText("save", "pt-BR"), "Salvar");
  assert.equal(pluginProfileNamedUrlsText("cancel", "pt-BR"), "Cancelar");
  assert.equal(pluginProfileNamedUrlsText("editUrl", "pt-BR"), "Editar URL");
  assert.equal(pluginProfileNamedUrlsText("removeUrl", "pt-BR"), "Remover URL");
});
