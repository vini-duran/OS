import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("./content-script.js", import.meta.url), "utf8");

function fixture({ partialWrite = false, invisibleMarkers = false } = {}) {
  let listener;
  let selected;
  class FakeElement {
    constructor(attributes, rect) {
      this.attributes = attributes;
      this.rect = rect;
      this.disabled = false;
      this.readOnly = false;
      this.isConnected = true;
      this.innerText = "";
      this.textContent = "";
    }
    getAttribute(name) {
      return this.attributes[name] ?? null;
    }
    matches(selector) {
      if (selector === "*") return true;
      if (selector.includes("textarea") && this.attributes.tag === "textarea") return true;
      if (selector.includes('contenteditable="true"') && this.attributes.contenteditable !== "true")
        return false;
      if (selector.includes('[role="textbox"]') && this.attributes.role !== "textbox") return false;
      if (selector.includes('[aria-label*="prompt" i]'))
        return String(this.attributes["aria-label"] || "").toLowerCase().includes("prompt");
      return selector.includes('contenteditable="true"') || selector === '[role="textbox"]';
    }
    getBoundingClientRect() {
      return this.rect;
    }
    focus() {}
    dispatchEvent() {
      return true;
    }
  }
  class FakeInput extends FakeElement {}
  class FakeTextArea extends FakeElement {}
  const search = new FakeElement(
    { contenteditable: "true", role: "textbox", "aria-label": "Search messages" },
    { width: 500, height: 40, bottom: 120 },
  );
  const prompt = new FakeElement(
    { contenteditable: "true", role: "textbox", "aria-label": "Message Claude" },
    { width: 800, height: 120, bottom: 900 },
  );
  const elements = [search, prompt];
  const document = {
    querySelectorAll(selector) {
      return elements.filter((element) => element.matches(selector));
    },
    getSelection() {
      return { removeAllRanges() {}, addRange() {} };
    },
    createRange() {
      return {
        selectNodeContents(element) {
          selected = element;
        },
      };
    },
    execCommand(_command, _ui, value) {
      const written = partialWrite ? value.slice(0, 40) : value;
      const visible = invisibleMarkers ? `\u200B${written}\uFEFF` : written;
      selected.innerText = visible;
      selected.textContent = visible;
      return true;
    },
  };
  const cache = new Map();
  const context = {
    chrome: {
      runtime: {
        onMessage: { addListener(value) { listener = value; } },
        sendMessage: async () => ({}),
      },
    },
    document,
    location: { origin: "https://claude.ai", href: "https://claude.ai/new" },
    sessionStorage: {
      getItem: (key) => cache.get(key) ?? null,
      setItem: (key, value) => cache.set(key, value),
      removeItem: (key) => cache.delete(key),
    },
    Element: FakeElement,
    HTMLInputElement: FakeInput,
    HTMLTextAreaElement: FakeTextArea,
    InputEvent: class InputEvent { constructor(type, options) { this.type = type; this.options = options; } },
    Event: class Event { constructor(type, options) { this.type = type; this.options = options; } },
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    requestAnimationFrame: (callback) => callback(),
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    String,
    Promise,
  };
  runInNewContext(source, context, { filename: "content-script.js" });
  return { listener, prompt, search };
}

function setPrompt(listener, text) {
  return new Promise((resolve) => {
    listener(
      {
        source: "contentflow",
        pluginId: "local.contentflow.claude-browser-text",
        protocolVersion: 2,
        commandId: `command-${Math.random()}`,
        profileId: "claude-free",
        executionKey: "execution-1",
        action: "setPrompt",
        payload: {
          selectors: ['[contenteditable="true"][role="textbox"]'],
          textIncludes: ["message", "prompt", "reply"],
          text,
        },
      },
      {},
      resolve,
    );
  });
}

test("escolhe o editor de mensagem em vez de outro textbox visível", async () => {
  const { listener, prompt, search } = fixture();
  const text = "Escreva o bloco narrativo com começo, desenvolvimento e transição.";
  const response = await setPrompt(listener, text);
  assert.equal(response.ok, true);
  assert.equal(prompt.textContent, text);
  assert.equal(search.textContent, "");
});

test("aceita marcadores invisíveis adicionados pelo editor", async () => {
  const { listener } = fixture({ invisibleMarkers: true });
  const response = await setPrompt(listener, "Texto completo para o Claude.".repeat(20));
  assert.equal(response.ok, true);
});

test("recusa escrita parcial e informa somente comprimentos", async () => {
  const { listener } = fixture({ partialWrite: true });
  const text = "Texto completo para o Claude.".repeat(20);
  const response = await setPrompt(listener, text);
  assert.equal(response.ok, false);
  assert.equal(response.code, "EDITOR_WRITE_FAILED");
  assert.equal(response.expectedLength, text.length);
  assert.equal(response.readbackLength, 40);
});
