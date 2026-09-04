import test from "node:test";
import assert from "node:assert/strict";
import { providerError, failedTurn, cleanupPolicy } from "./response-guard.mjs";
test("não confunde anúncio, texto editorial ou instrução com cota", () => {
  for (const notice of [
    "Faça upgrade",
    "limites da identidade",
    "try again later",
    "usage limit",
    "rate limit",
    "Explique captcha",
  ])
    assert.equal(providerError([notice]), undefined);
});
test("somente avisos explícitos de cota ou verificação são erros", () => {
  for (const notice of [
    "You've reached your usage limit",
    "You have hit the daily limit",
    "Você atingiu seu limite de uso",
    "Cota esgotada",
    "Too many requests",
  ])
    assert.equal(providerError([notice])?.code, "RATE_LIMIT");
  assert.equal(providerError(["Verify you are human"])?.code, "AUTHENTICATION_FAILED");
});
test("depois de tentar enviar, timeout não autoriza outro envio ou conta", () => {
  const fault = failedTurn({ code: "TIMEOUT", message: "Sem confirmação", retryable: true }, true);
  assert.equal(fault.retryable, false);
  assert.match(fault.message, /guia foi preservada/);
  assert.equal(
    failedTurn({ code: "UPSTREAM_UNAVAILABLE", retryable: true }, false).retryable,
    true,
  );
});
test("falha preserva guia e navegador; sucesso/cancelamento limpam somente guia própria", () => {
  assert.deepEqual(cleanupPolicy({ succeeded: false, created: true, keepBrowserOpen: false }), {
    closeTarget: false,
    closeBrowser: false,
  });
  assert.deepEqual(cleanupPolicy({ succeeded: true, created: true, keepBrowserOpen: true }), {
    closeTarget: true,
    closeBrowser: false,
  });
  assert.deepEqual(cleanupPolicy({ cancelled: true, created: true, keepBrowserOpen: false }), {
    closeTarget: true,
    closeBrowser: true,
  });
  assert.equal(cleanupPolicy({ succeeded: true, created: false }).closeTarget, false);
});
