const PROTOCOL_VERSION = 2;
const ORIGIN_PLUGINS = Object.freeze({
  "https://chatgpt.com": new Set(["local.contentflow.chatgpt-browser-studio"]),
  "https://claude.ai": new Set(["local.contentflow.claude-browser-text"]),
  "https://gemini.google.com": new Set(["local.contentflow.gemini-browser-studio"]),
  "https://grok.com": new Set(["local.contentflow.grok-browser-studio"]),
  "https://labs.google": new Set(["local.contentflow.google-flow-batch-images"]),
  "https://meta.ai": new Set(["local.contentflow.meta-ai-browser-studio"]),
  "https://www.meta.ai": new Set(["local.contentflow.meta-ai-browser-studio"]),
});
const cancelledExecutions = new Set();

function visible(element) {
  if (!(element instanceof Element)) return false;
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) !== 0 &&
    rect.width > 8 &&
    rect.height > 8
  );
}

function allDeep(selector, root = document) {
  const output = [];
  const visit = (node) => {
    if (!node?.querySelectorAll) return;
    for (const element of node.querySelectorAll(selector)) output.push(element);
    for (const element of node.querySelectorAll("*")) {
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  visit(root);
  return [...new Set(output)];
}

function normalizedSelectors(value, fallback) {
  const candidates = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const normalized = candidates
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 20);
  return normalized.length ? normalized : fallback;
}

function elementsFor(selectors) {
  const output = [];
  for (const selector of selectors) {
    try {
      output.push(...allDeep(selector));
    } catch {
      // O adapter forneceu um seletor inválido; a ponte não amplia a origem autorizada.
    }
  }
  return [...new Set(output)];
}

function textOf(element) {
  return [
    element?.innerText,
    element?.textContent,
    element?.getAttribute?.("aria-label"),
    element?.getAttribute?.("title"),
    element?.getAttribute?.("placeholder"),
    element?.getAttribute?.("data-testid"),
    element?.getAttribute?.("data-test-id"),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isEditable(element) {
  if (!(element instanceof Element) || !visible(element) || element.disabled || element.readOnly) {
    return false;
  }
  const contenteditable = (element.getAttribute("contenteditable") || "").toLowerCase();
  return (
    element.getAttribute("data-slate-editor") === "true" ||
    contenteditable === "true" ||
    contenteditable === "plaintext-only" ||
    element.matches('textarea, input[type="text"], input:not([type]), [role="textbox"]')
  );
}

function editableCandidate(payload) {
  const selectors = normalizedSelectors(payload?.selectors || payload?.selector, [
    '[data-slate-editor="true"]',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',
    "textarea",
    'input[type="text"]',
    '[role="textbox"]',
  ]);
  const candidates = elementsFor(selectors).filter(isEditable);
  if (!candidates.length) return null;
  const terms = (Array.isArray(payload?.textIncludes) ? payload.textIncludes : [])
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 30);
  const preferred = terms.length
    ? candidates.filter((element) => terms.some((term) => textOf(element).includes(term)))
    : [];
  const pool = preferred.length ? preferred : candidates;
  return (
    [...pool].sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return rightRect.bottom - leftRect.bottom || rightRect.width - leftRect.width;
    })[0] || null
  );
}

function clickableCandidate(payload) {
  const selectors = normalizedSelectors(payload?.selectors || payload?.selector, [
    "button",
    '[role="button"]',
    '[role="menuitem"]',
    '[role="option"]',
  ]);
  const terms = (Array.isArray(payload?.textIncludes) ? payload.textIncludes : [])
    .map((item) =>
      String(item || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
    .slice(0, 30);
  return (
    elementsFor(selectors)
      .filter(
        (element) =>
          visible(element) &&
          !element.disabled &&
          element.getAttribute("aria-disabled") !== "true" &&
          (!terms.length || terms.some((term) => textOf(element).includes(term))),
      )
      .sort((left, right) => textOf(left).length - textOf(right).length)[0] || null
  );
}

function normalizeEditorText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readEditorText(element) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value;
  }
  return element.innerText || element.textContent || "";
}

function dispatchEditorEvents(element, value) {
  element.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }),
  );
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function replaceText(element, value) {
  element.focus({ preventScroll: true });
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, value);
    dispatchEditorEvents(element, value);
    return element.value;
  }
  const selection = document.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand("insertText", false, value);
  dispatchEditorEvents(element, value);
  return readEditorText(element);
}

function editorContainsExpected(actual, expected) {
  if (!expected) return true;
  if (actual === expected) return true;
  const prefixLength = Math.min(120, expected.length);
  const suffixLength = Math.min(120, expected.length);
  return (
    actual.includes(expected.slice(0, prefixLength)) &&
    actual.includes(expected.slice(-suffixLength)) &&
    actual.length >= Math.floor(expected.length * 0.9)
  );
}

async function stableEditorReadback(original, payload) {
  // Background tabs may never produce animation frames. Yield for framework
  // updates without waiting for paint, then still validate the actual editor.
  await new Promise((resolve) => setTimeout(resolve, 50));
  const current = original?.isConnected === false ? editableCandidate(payload) : original;
  return normalizeEditorText(readEditorText(current));
}

async function dispatchAction(action, payload) {
  if (action === "ping") return { ok: true, protocolVersion: PROTOCOL_VERSION, url: location.href };
  if (action === "inspect") {
    return {
      ok: true,
      protocolVersion: PROTOCOL_VERSION,
      url: location.href,
      title: document.title,
      editableReady: Boolean(editableCandidate(payload)),
      ...(payload?.includeTabMarker ? { tabMarker: document.documentElement.getAttribute('data-contentflow-tab-marker') } : {}),
    };
  }
  if (action === "setText" || action === "setPrompt") {
    const editable = editableCandidate(payload);
    if (!editable) {
      return { ok: false, code: "EDITOR_NOT_FOUND", message: "Editor não encontrado." };
    }
    const text = String(payload?.text || "");
    const expected = normalizeEditorText(text);
    replaceText(editable, text);
    const actual = await stableEditorReadback(editable, payload);
    if (!editorContainsExpected(actual, expected)) {
      return {
        ok: false,
        code: "EDITOR_WRITE_FAILED",
        message: "O texto não permaneceu no editor.",
        expectedLength: expected.length,
        readbackLength: actual.length,
      };
    }
    return { ok: true, readbackLength: actual.length };
  }
  if (action === "click" || action === "clickGenerate") {
    const normalizedPayload =
      action === "clickGenerate" && !payload?.textIncludes
        ? { ...payload, textIncludes: ["criar", "create", "gerar", "generate"] }
        : payload;
    const clickable = clickableCandidate(normalizedPayload);
    if (!clickable) {
      return {
        ok: false,
        code: "CONTROL_NOT_FOUND",
        message: "Controle não encontrado ou desabilitado.",
      };
    }
    const label = textOf(clickable);
    clickable.click();
    return { ok: true, text: label };
  }
  return { ok: false, code: "UNKNOWN_ACTION", message: `Ação não suportada: ${String(action)}` };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const allowedPlugins = ORIGIN_PLUGINS[location.origin];
  if (
    message?.source !== "contentflow" ||
    !allowedPlugins?.has(message?.pluginId) ||
    message?.protocolVersion !== PROTOCOL_VERSION ||
    typeof message?.commandId !== "string" ||
    typeof message?.profileId !== "string" ||
    typeof message?.executionKey !== "string"
  ) {
    return false;
  }
  if (message.action === "cancel") {
    cancelledExecutions.add(message.executionKey);
    sendResponse({ ok: true });
    return false;
  }
  if (cancelledExecutions.has(message.executionKey)) {
    sendResponse({ ok: false, code: "CANCELLED", message: "Execução cancelada." });
    return false;
  }
  const cacheKey = `contentflow:${message.commandId}`;
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
    if (cached?.executionKey === message.executionKey && cached?.response) {
      sendResponse({ ...cached.response, replayed: true });
      return false;
    }
  } catch {
    sessionStorage.removeItem(cacheKey);
  }
  dispatchAction(message.action, message.payload || {})
    .then((response) => {
      try {
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({ executionKey: message.executionKey, response, storedAt: Date.now() }),
        );
      } catch {
        // O cache principal também existe no storage.session do service worker.
      }
      sendResponse(response);
    })
    .catch((error) =>
      sendResponse({
        ok: false,
        code: "CONTENT_SCRIPT_ERROR",
        message: error?.message || String(error),
      }),
    );
  return true;
});

chrome.runtime.sendMessage({ source: "contentflow-provider-page", action: "wake" }).catch(() => {});
