import assert from "node:assert/strict";
import test from "node:test";

import {
  PLUGIN_CARD_GRID_MIN_WIDTH_PX,
  isPluginCardSize,
  normalizePluginCardSize,
  pluginCardGridStyle,
} from "./plugin-card-size";

test("normaliza ausente e inválido para medium, tolerando caixa e espaços", () => {
  assert.equal(normalizePluginCardSize(undefined), "medium");
  assert.equal(normalizePluginCardSize(null), "medium");
  assert.equal(normalizePluginCardSize(""), "medium");
  assert.equal(normalizePluginCardSize("extra-grande"), "medium");
  assert.equal(normalizePluginCardSize(42), "medium");
  assert.equal(normalizePluginCardSize("small"), "small");
  assert.equal(normalizePluginCardSize(" LARGE "), "large");
  assert.equal(normalizePluginCardSize("Medium"), "medium");
  assert.ok(isPluginCardSize("small"));
  assert.equal(isPluginCardSize("gigante"), false);
});

test("larguras mínimas crescem com o tamanho sem contagem fixa", () => {
  assert.ok(PLUGIN_CARD_GRID_MIN_WIDTH_PX.small < PLUGIN_CARD_GRID_MIN_WIDTH_PX.medium);
  assert.ok(PLUGIN_CARD_GRID_MIN_WIDTH_PX.medium < PLUGIN_CARD_GRID_MIN_WIDTH_PX.large);
});

test("grade declara auto-fill e limita o mínimo à largura do contêiner", () => {
  for (const size of ["small", "medium", "large"] as const) {
    const style = pluginCardGridStyle(size);
    const min = PLUGIN_CARD_GRID_MIN_WIDTH_PX[size];
    assert.ok(style.gridTemplateColumns.includes("auto-fill"));
    assert.ok(style.gridTemplateColumns.includes(`minmax(min(100%, ${min}px), 1fr)`));
    // Sem suposição de quantidade fixa de colunas.
    assert.equal(style.gridTemplateColumns.includes("grid-cols-"), false);
  }
  // Aumentar reduz colunas (mínimo maior), diminuir faz o reverso.
  assert.ok(PLUGIN_CARD_GRID_MIN_WIDTH_PX.large > PLUGIN_CARD_GRID_MIN_WIDTH_PX.small);
});
