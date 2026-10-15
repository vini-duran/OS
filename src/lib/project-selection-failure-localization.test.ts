import assert from "node:assert/strict";
import test from "node:test";
import {
  pluginProfileNamedUrlsText,
  projectSelectionFailureTextForCode,
} from "./plugin-profile-named-urls-localization";

test("PROJECT_DESTINATION_CHANGED maps to PT/EN/ES without leaking PT", () => {
  const pt = projectSelectionFailureTextForCode("PROJECT_DESTINATION_CHANGED", "pt-BR");
  const en = projectSelectionFailureTextForCode("PROJECT_DESTINATION_CHANGED", "en");
  const es = projectSelectionFailureTextForCode("PROJECT_DESTINATION_CHANGED", "es");
  assert.equal(pt, pluginProfileNamedUrlsText("projectChanged", "pt-BR"));
  assert.equal(en, pluginProfileNamedUrlsText("projectChanged", "en"));
  assert.equal(es, pluginProfileNamedUrlsText("projectChanged", "es"));
  assert.ok(pt && pt.length > 0);
  // EN/ES must not leak the PT diagnostic verbatim.
  assert.notEqual(en, pt);
  assert.notEqual(es, pt);
  assert.ok(!en!.includes("Escolha novamente o projeto antes de executar."));
  assert.ok(!es!.includes("Escolha novamente o projeto antes de executar."));
});

test("legacy errors pass through untouched", () => {
  assert.equal(projectSelectionFailureTextForCode(undefined, "en"), undefined);
  assert.equal(projectSelectionFailureTextForCode("SOME_LEGACY_CODE", "en"), undefined);
  assert.equal(projectSelectionFailureTextForCode("", "pt-BR"), undefined);
});
