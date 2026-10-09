/**
 * Tamanho dos cards da biblioteca de plugins (Interface 3).
 *
 * Regras genuínas de tamanho: cada tamanho mapeia para uma largura mínima de
 * coluna da grade. A grade usa `repeat(auto-fill, minmax(min, 1fr))` sobre a
 * largura real do contêiner, sem supor quantidade fixa de plugins por linha.
 */

export const PLUGIN_CARD_SIZES = ["small", "medium", "large"] as const;

export type PluginCardSize = (typeof PLUGIN_CARD_SIZES)[number];

export const PLUGIN_CARD_SIZE_DEFAULT: PluginCardSize = "medium";

export const PLUGIN_CARD_GRID_MIN_WIDTH_PX: Record<PluginCardSize, number> = {
  small: 180,
  medium: 220,
  large: 300,
};

export function isPluginCardSize(value: unknown): value is PluginCardSize {
  return value === "small" || value === "medium" || value === "large";
}

/**
 * Normalização tolerante (leitura): aceita as três strings conhecidas,
 * tolerando espaços e caixa; qualquer outro valor volta para `medium`,
 * preservando a aparência atual para preferências legadas sem o campo.
 */
export function normalizePluginCardSize(value: unknown): PluginCardSize {
  if (typeof value === "string") {
    const clean = value.trim().toLowerCase();
    if (isPluginCardSize(clean)) return clean;
  }
  return PLUGIN_CARD_SIZE_DEFAULT;
}

/**
 * Estilo da grade responsiva: aumenta o mínimo por coluna quando o tamanho
 * cresce (menos colunas) e reduz quando diminui (mais colunas), sem overflow
 * porque as colunas preenchem (`1fr`) a largura real do contêiner.
 */
export function pluginCardGridStyle(size: PluginCardSize): { gridTemplateColumns: string } {
  const min = PLUGIN_CARD_GRID_MIN_WIDTH_PX[size] ?? PLUGIN_CARD_GRID_MIN_WIDTH_PX.medium;
  return { gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))` };
}
