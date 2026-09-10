// Only provider UI notices are evidence of a provider error. Never scan chat text.
export function providerNotices() {
  const content =
    '[contenteditable="true"],[role="textbox"],textarea,user-query,message-content,.model-response-text,structured-content-container,.response-container-content,[data-test-id="model-response"],.standard-markdown,.font-claude-response,[data-message-author-role],[data-testid*="assistant" i]';
  return [
    ...document.querySelectorAll(
      '[role="alert"],[role="alertdialog"],[role="dialog"],[data-testid*="error" i],[data-test-id*="error" i],.error-container,.error-message',
    ),
  ]
    .filter((el) => {
      if (el.closest(content)) return false;
      const style = getComputedStyle(el),
        rect = el.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    })
    .map((el) => {
      const copy = el.cloneNode(true);
      copy.querySelectorAll(content).forEach((child) => child.remove());
      return (copy.innerText || copy.textContent || "").replace(/\s+/g, " ").trim().slice(0, 1500);
    })
    .filter(Boolean);
}

export function providerError(notices = []) {
  for (const notice of notices) {
    if (
      /(?:you(?:'ve| have)? (?:reached|hit|exceeded)|you have exhausted).{0,80}(?:limit|quota)|(?:usage|message|daily|rate) limit (?:reached|exceeded)|(?:atingiu|alcançou|excedeu|esgotou).{0,80}(?:limite|cota)|(?:limite|cota).{0,40}(?:atingid[oa]|excedid[oa]|esgotad[oa])|too many requests/i.test(
        notice,
      )
    ) {
      return {
        code: "RATE_LIMIT",
        message:
          "O provedor exibiu um aviso explícito de limite de uso. A execução foi pausada; nenhum reenvio automático.",
      };
    }
    if (
      /verify (?:that )?you are human|verifique (?:se|que) você é humano|complete (?:the|this) captcha|conclua o captcha/i.test(
        notice,
      )
    ) {
      return {
        code: "AUTHENTICATION_FAILED",
        message: "O provedor exige verificação humana. A execução foi pausada.",
      };
    }
  }
  return undefined;
}

// Provider quota and authentication notices pause for reconciliation, even
// before send. A ready profile is not evidence that switching is appropriate.
export function preSendProviderError(notices = []) {
  const fault = providerError(notices);
  if (!fault) return undefined;
  return { ...fault, retryable: false };
}

// A send click may succeed even when its acknowledgement is lost.
export function canRetryTurn(error, submitted) {
  return (
    !submitted &&
    Boolean(error?.retryable) &&
    !["CANCELLED", "AUTHENTICATION_FAILED", "RATE_LIMIT"].includes(error?.code)
  );
}

export function failedTurn(error, submitted) {
  return {
    code: error?.code || "UPSTREAM_UNAVAILABLE",
    message:
      (error?.message || "Falha na automação do navegador.") +
      (submitted
        ? " O prompt pode já ter sido enviado; a guia foi preservada para conferência antes de repetir."
        : ""),
    retryable: canRetryTurn(error, submitted),
  };
}
export function cleanupPolicy({ succeeded, cancelled, created, keepBrowserOpen }) {
  return {
    closeTarget: Boolean(created && (succeeded || cancelled)),
    closeBrowser: Boolean(keepBrowserOpen === false && (succeeded || cancelled)),
  };
}
