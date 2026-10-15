import assert from "node:assert/strict";
import test from "node:test";
import { resolveFailedExecutionVisibleError } from "./process-runner";
import { pluginProfileNamedUrlsText } from "../lib/plugin-profile-named-urls-localization";

test("FailedExecutionGate path maps code to PT/EN/ES; no PT leak", () => {
  const ptRaw = "O destino mudou (diagnóstico PT)";
  assert.equal(
    resolveFailedExecutionVisibleError(ptRaw, "PROJECT_DESTINATION_CHANGED", "pt-BR"),
    pluginProfileNamedUrlsText("projectChanged", "pt-BR"),
  );
  assert.equal(
    resolveFailedExecutionVisibleError(ptRaw, "PROJECT_DESTINATION_CHANGED", "en"),
    pluginProfileNamedUrlsText("projectChanged", "en"),
  );
  assert.equal(
    resolveFailedExecutionVisibleError(ptRaw, "PROJECT_DESTINATION_CHANGED", "es"),
    pluginProfileNamedUrlsText("projectChanged", "es"),
  );
  const en = resolveFailedExecutionVisibleError(ptRaw, "PROJECT_DESTINATION_CHANGED", "en");
  assert.ok(!en.includes("Escolha novamente o projeto antes de executar."));
  // Legacy scope preserved.
  assert.equal(resolveFailedExecutionVisibleError("falha legada", undefined, "en"), "falha legada");
  assert.equal(
    resolveFailedExecutionVisibleError("falha legada", "SOME_LEGACY", "en"),
    "falha legada",
  );
});
