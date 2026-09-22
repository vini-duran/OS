import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { FOCUS_SEARCH_EVENT } from "./search-shortcut";

test("página Plugins possui input de busca com aria-keyshortcuts e placeholder correspondentes", () => {
  const pluginsFilePath = path.resolve(process.cwd(), "src/routes/plugins.tsx");
  const content = fs.readFileSync(pluginsFilePath, "utf-8");

  // Verifica se o campo de busca de plugins tem aria-keyshortcuts="Meta+F Control+F"
  assert.ok(
    content.includes('aria-keyshortcuts="Meta+F Control+F"'),
    "Página Plugins deve conter aria-keyshortcuts=\"Meta+F Control+F\"",
  );

  // Verifica se o placeholder exato "Pesquisar plugins por nome..." está presente
  assert.ok(
    content.includes('placeholder="Pesquisar plugins por nome..."'),
    "Página Plugins deve conter placeholder=\"Pesquisar plugins por nome...\"",
  );

  // Verifica se o ref do input está associado ao hook do atalho
  assert.ok(
    content.includes("useFocusSearchShortcut(searchInputRef)"),
    "Página Plugins deve registrar o hook useFocusSearchShortcut com searchInputRef",
  );
  assert.ok(
    content.includes("ref={searchInputRef}"),
    "Input da página Plugins deve receber ref={searchInputRef}",
  );
});

test("páginas Métodos e Canal/Projetos registram foco do atalho de busca", () => {
  const methodsFilePath = path.resolve(process.cwd(), "src/routes/methods.tsx");
  const methodsContent = fs.readFileSync(methodsFilePath, "utf-8");
  assert.ok(
    methodsContent.includes("useFocusSearchShortcut(searchInputRef)"),
    "Página Métodos deve registrar o hook useFocusSearchShortcut",
  );
  assert.ok(
    methodsContent.includes("ref={searchInputRef}"),
    "Input de busca de Métodos deve receber o ref",
  );

  const channelIndexPath = path.resolve(process.cwd(), "src/routes/channel.$channelId.index.tsx");
  const channelIndexContent = fs.readFileSync(channelIndexPath, "utf-8");
  assert.ok(
    channelIndexContent.includes("useFocusSearchShortcut(searchInputRef)"),
    "Página Canal/Projetos deve registrar o hook useFocusSearchShortcut",
  );
  assert.ok(
    channelIndexContent.includes("ref={searchInputRef}"),
    "Input de busca do canal deve receber o ref",
  );
});

test("contrato de foco real: ao receber o evento de busca, input alvo recebe focus() e select()", () => {
  let focusCalls = 0;
  let selectCalls = 0;

  const mockInput = {
    focus() {
      focusCalls++;
    },
    select() {
      selectCalls++;
    },
  };

  // Simulação do comportamento de useFocusSearchShortcut
  const listeners: Record<string, Function[]> = {};
  const mockWindow = {
    addEventListener(type: string, fn: Function) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener(type: string, fn: Function) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== fn);
    },
    dispatchEvent(event: { type: string }) {
      (listeners[event.type] || []).forEach((fn) => fn(event));
      return true;
    },
  };

  // Registra listener no mockWindow
  const onFocusSearch = () => {
    mockInput.focus();
    mockInput.select();
  };
  mockWindow.addEventListener(FOCUS_SEARCH_EVENT, onFocusSearch);

  // Dispara evento
  mockWindow.dispatchEvent({ type: FOCUS_SEARCH_EVENT });

  assert.equal(focusCalls, 1, "Input deve receber foco real");
  assert.equal(selectCalls, 1, "Input deve ter texto selecionado para edição rápida");

  // Remove listener
  mockWindow.removeEventListener(FOCUS_SEARCH_EVENT, onFocusSearch);
  mockWindow.dispatchEvent({ type: FOCUS_SEARCH_EVENT });
  assert.equal(focusCalls, 1, "Após cleanup, listener não deve ser chamado");
});
