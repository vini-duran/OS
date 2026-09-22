import assert from "node:assert/strict";
import test from "node:test";
import {
  FOCUS_SEARCH_EVENT,
  dispatchFocusSearch,
  handleSearchShortcutKeyDown,
  isEditableElement,
  isKeyboardShortcutForSearch,
  shouldInterceptSearchShortcut,
} from "./search-shortcut";

function createMockKeyboardEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  const key = overrides.key ?? "f";
  const code = overrides.code ?? (key === "f" || key === "F" ? "KeyF" : `Key${key.toUpperCase()}`);
  const event = {
    key,
    code,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...overrides,
  };
  return event as unknown as KeyboardEvent;
}

function createMockElement(
  tagName: string,
  attrs: Record<string, string> = {},
  isContentEditable = false,
  parent: any = null,
) {
  const element: any = {
    tagName: tagName.toUpperCase(),
    isContentEditable,
    parentElement: parent,
    getAttribute(name: string) {
      return attrs[name] ?? null;
    },
    closest(selector: string) {
      let current: any = element;
      while (current) {
        if (selector.includes("contenteditable") && (current.isContentEditable || current.getAttribute("contenteditable") !== null)) {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    },
    focusCalled: false,
    selectCalled: false,
    focus() {
      this.focusCalled = true;
    },
    select() {
      this.selectCalled = true;
    },
  };
  return element;
}

test("isKeyboardShortcutForSearch detecta Meta+F e Ctrl+F", () => {
  // Meta+F (macOS)
  assert.equal(
    isKeyboardShortcutForSearch(createMockKeyboardEvent({ metaKey: true, key: "f" })),
    true,
  );
  assert.equal(
    isKeyboardShortcutForSearch(createMockKeyboardEvent({ metaKey: true, key: "F" })),
    true,
  );
  assert.equal(
    isKeyboardShortcutForSearch(createMockKeyboardEvent({ metaKey: true, key: "Unidentified", code: "KeyF" })),
    true,
  );

  // Ctrl+F (Windows / Linux)
  assert.equal(
    isKeyboardShortcutForSearch(createMockKeyboardEvent({ ctrlKey: true, key: "f" })),
    true,
  );
  assert.equal(
    isKeyboardShortcutForSearch(createMockKeyboardEvent({ ctrlKey: true, key: "F" })),
    true,
  );

  // Rejeições
  assert.equal(
    isKeyboardShortcutForSearch(createMockKeyboardEvent({ metaKey: false, ctrlKey: false, key: "f" })),
    false,
  );
  assert.equal(
    isKeyboardShortcutForSearch(createMockKeyboardEvent({ metaKey: true, key: "k" })),
    false,
  );
  assert.equal(
    isKeyboardShortcutForSearch(createMockKeyboardEvent({ metaKey: true, altKey: true, key: "f" })),
    false,
  );
  assert.equal(
    isKeyboardShortcutForSearch(createMockKeyboardEvent({ metaKey: true, shiftKey: true, key: "f" })),
    false,
  );
  assert.equal(
    isKeyboardShortcutForSearch(createMockKeyboardEvent({ ctrlKey: true, altKey: true, key: "f" })),
    false,
  );
  assert.equal(
    isKeyboardShortcutForSearch(createMockKeyboardEvent({ ctrlKey: true, shiftKey: true, key: "f" })),
    false,
  );
});

test("isEditableElement identifica inputs, textareas, selects e contenteditable", () => {
  assert.equal(isEditableElement(createMockElement("input")), true);
  assert.equal(isEditableElement(createMockElement("textarea")), true);
  assert.equal(isEditableElement(createMockElement("select")), true);
  assert.equal(isEditableElement(createMockElement("div", { contenteditable: "true" })), true);
  assert.equal(isEditableElement(createMockElement("div", { contenteditable: "" })), true);
  assert.equal(isEditableElement(createMockElement("div", {}, true)), true);

  // Filho dentro de contenteditable
  const parentEditable = createMockElement("div", { contenteditable: "true" });
  const childSpan = createMockElement("span", {}, false, parentEditable);
  assert.equal(isEditableElement(childSpan), true);

  // Não editáveis
  assert.equal(isEditableElement(createMockElement("body")), false);
  assert.equal(isEditableElement(createMockElement("div")), false);
  assert.equal(isEditableElement(createMockElement("button")), false);
  assert.equal(isEditableElement(createMockElement("a")), false);
  assert.equal(isEditableElement(null), false);
  assert.equal(isEditableElement(undefined), false);
});

test("shouldInterceptSearchShortcut preserva comportamento normal quando foco está em campos editáveis", () => {
  const metaF = createMockKeyboardEvent({ metaKey: true, key: "f" });

  // Foco em input
  const docWithInput = { activeElement: createMockElement("input") } as unknown as Document;
  assert.equal(shouldInterceptSearchShortcut(metaF, docWithInput), false);

  // Foco em textarea
  const docWithTextarea = { activeElement: createMockElement("textarea") } as unknown as Document;
  assert.equal(shouldInterceptSearchShortcut(metaF, docWithTextarea), false);

  // Foco em select
  const docWithSelect = { activeElement: createMockElement("select") } as unknown as Document;
  assert.equal(shouldInterceptSearchShortcut(metaF, docWithSelect), false);

  // Foco em contenteditable
  const docWithEditable = {
    activeElement: createMockElement("div", { contenteditable: "true" }),
  } as unknown as Document;
  assert.equal(shouldInterceptSearchShortcut(metaF, docWithEditable), false);

  // Event target em input
  const eventOnInput = createMockKeyboardEvent({
    metaKey: true,
    key: "f",
    target: createMockElement("input"),
  } as any);
  assert.equal(
    shouldInterceptSearchShortcut(eventOnInput, { activeElement: createMockElement("body") } as unknown as Document),
    false,
  );

  // Foco normal fora de editáveis: intercepta!
  const docBody = { activeElement: createMockElement("body") } as unknown as Document;
  assert.equal(shouldInterceptSearchShortcut(metaF, docBody), true);

  const docButton = { activeElement: createMockElement("button") } as unknown as Document;
  assert.equal(shouldInterceptSearchShortcut(metaF, docButton), true);
});

test("handleSearchShortcutKeyDown intercepta atalho, previne default e despacha evento centralizado", () => {
  const metaF = createMockKeyboardEvent({ metaKey: true, key: "f" });
  const doc = { activeElement: createMockElement("body") } as unknown as Document;

  let dispatchedEvent: any = null;
  const mockTarget = {
    dispatchEvent(event: any) {
      dispatchedEvent = event;
      return true;
    },
  } as unknown as EventTarget;

  const result = handleSearchShortcutKeyDown(metaF, doc, mockTarget);

  assert.equal(result, true);
  assert.equal(metaF.defaultPrevented, true, "preventDefault deve ser chamado ao interceptar");
  assert.ok(dispatchedEvent, "Evento centralizado deve ter sido despachado");
  assert.equal(dispatchedEvent.type, FOCUS_SEARCH_EVENT);
  assert.equal(dispatchedEvent.detail?.source, "global-shortcut");
});

test("handleSearchShortcutKeyDown NÃO previne default nem despacha evento se foco está em input", () => {
  const metaF = createMockKeyboardEvent({ metaKey: true, key: "f" });
  const doc = { activeElement: createMockElement("input") } as unknown as Document;

  let dispatchedEvent: any = null;
  const mockTarget = {
    dispatchEvent(event: any) {
      dispatchedEvent = event;
      return true;
    },
  } as unknown as EventTarget;

  const result = handleSearchShortcutKeyDown(metaF, doc, mockTarget);

  assert.equal(result, false);
  assert.equal(metaF.defaultPrevented, false, "NÃO deve chamar preventDefault");
  assert.equal(dispatchedEvent, null, "NÃO deve despachar evento");
});

test("dispatchFocusSearch funciona sem erros onde não há receptor", () => {
  const mockTargetWithoutListeners = {
    dispatchEvent(_event: any) {
      return true;
    },
  } as unknown as EventTarget;

  const res = dispatchFocusSearch(mockTargetWithoutListeners);
  assert.equal(res, true);
});
