import assert from "node:assert/strict";
import test from "node:test";
import {
  localProfileConfigurationKeys,
  managedProjectUrlConfigurationKey,
  normalizeProjectSelections,
  requiresProjectSelection,
  stripManagedProjectConfiguration,
} from "./profile-project-selection";
import { translate } from "./app-preferences";
import {
  pluginProfileNamedUrlsMessageForCode,
  pluginProfileNamedUrlsText,
} from "./plugin-profile-named-urls-localization";

const SETUP = {
  configurationKey: "profile",
  fallbackConfigurationKey: "fallbackProfiles",
  label: "Perfil",
  namedUrls: {
    allowedHosts: ["flow.example.com"],
    configurationKey: "projectUrl",
  },
};

test("generic namedUrls configurationKey is opt-in and validated as a plain key", () => {
  assert.equal(managedProjectUrlConfigurationKey({}), undefined);
  assert.equal(
    managedProjectUrlConfigurationKey({ namedUrls: { allowedHosts: ["h"] } }),
    undefined,
  );
  assert.equal(
    managedProjectUrlConfigurationKey({
      namedUrls: { allowedHosts: ["h"], configurationKey: "projectUrl" },
    }),
    "projectUrl",
  );
  assert.equal(requiresProjectSelection({}), false);
  assert.equal(requiresProjectSelection(SETUP), true);
  assert.deepEqual(localProfileConfigurationKeys(SETUP), [
    "profile",
    "fallbackProfiles",
    "projectUrl",
  ]);
});

test("projectSelections normalize to bound profiles only, without defaults", () => {
  assert.equal(normalizeProjectSelections(undefined, ["a"]), undefined);
  assert.equal(normalizeProjectSelections({}, ["a"]), undefined);
  // No first-entry default and no inheritance: only explicit matching entries survive.
  assert.deepEqual(normalizeProjectSelections({ a: "url-1" }, ["a", "b"]), { a: "url-1" });
  assert.equal(normalizeProjectSelections({ b: "url-2" }, ["a"]), undefined);
  assert.deepEqual(normalizeProjectSelections({ a: "  url-1  " }, ["a"]), { a: "url-1" });
  assert.equal(normalizeProjectSelections({ a: "" }, ["a"]), undefined);
  assert.equal(normalizeProjectSelections({ a: "not an id!!" }, ["a"]), undefined);
});

test("portable configuration stripping removes managed URL but keeps functional keys", () => {
  const stripped = stripManagedProjectConfiguration(
    { model: "best", profile: "Main", fallbackProfiles: "Alt", projectUrl: "https://x" },
    SETUP,
  );
  assert.deepEqual(stripped, { model: "best" });
});

test("new Method interface labels exist in PT/EN/ES", () => {
  for (const phrase of [
    "Projeto nomeado por perfil",
    "Escolha um projeto pelo nome para cada perfil selecionado.",
    "Selecione o projeto",
    "Nenhum projeto cadastrado neste perfil.",
    "Cadastre URLs em Plugins, na seção Projetos deste perfil.",
    "Gerenciar projetos do perfil",
    "O projeto selecionado foi removido. Escolha outro projeto.",
    "Não foi possível carregar os projetos deste perfil.",
    "Nenhum projeto selecionado para este perfil.",
    "O destino deste projeto mudou no catálogo. Escolha novamente o projeto antes de executar.",
  ]) {
    assert.equal(translate(phrase, "pt-BR"), phrase);
    assert.notEqual(translate(phrase, "en"), phrase);
    assert.notEqual(translate(phrase, "es"), phrase);
  }
  for (const key of [
    "selectProject",
    "projectRemoved",
    "projectEmpty",
    "projectChanged",
  ] as const) {
    const pt = pluginProfileNamedUrlsText(key, "pt-BR");
    const en = pluginProfileNamedUrlsText(key, "en");
    const es = pluginProfileNamedUrlsText(key, "es");
    assert.ok(pt.length && en.length && es.length);
    assert.notEqual(en, pt);
    assert.notEqual(es, pt);
  }
  assert.ok(pluginProfileNamedUrlsMessageForCode("NOT_ENABLED", "en").length);
});
