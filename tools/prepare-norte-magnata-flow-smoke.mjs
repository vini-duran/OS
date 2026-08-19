#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const IMAGE_RISK_GUARDRAILS = "No pseudo-text, no duplicated objects or limbs, no cropped or disconnected limbs. Any visible screen or paper must be featureless or turned away unless its content will be added later as a validated overlay. Abstract smoke, mist, shadow or light must not form extra faces, people or creatures unless explicitly requested. One single continuous composition, no split screen, no diptych, no triptych, no collage, no comic panels or internal vertical bars. No frame-spanning horizontal or vertical graphic bands, stripes or blank zones. Keep the whole canvas within the dark noir palette; no predominantly white or off-white background.";

function guardImagePrompt(value) {
  const prompt = String(value || "").replace(/\s+/g, " ").trim();
  const normalized = prompt.toLowerCase();
  return ["no pseudo-text", "no duplicated objects or limbs", "no cropped or disconnected limbs", "must not form extra faces", "no triptych", "no frame-spanning", "no predominantly white"]
    .some((token) => !normalized.includes(token))
    ? `${prompt} ${IMAGE_RISK_GUARDRAILS}`
    : prompt;
}

const args = Object.fromEntries(
  process.argv.slice(2).map((value, index, all) =>
    value.startsWith("--") ? [value.slice(2), all[index + 1]] : ["", ""],
  ),
);
const api = String(args.api || "").replace(/\/$/, "");
const executionId = String(args.execution || "");
const runSlug = String(args.run || "smoke-001").trim();
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(api) || !executionId) {
  throw new Error("Uso: --api http://127.0.0.1:PORTA --execution ID [--run smoke-001]");
}
if (!/^smoke-\d{3}$/.test(runSlug)) throw new Error("--run deve seguir smoke-NNN.");
let overrides = {};
if (args.overrides) {
  overrides = JSON.parse(await readFile(path.resolve(String(args.overrides)), "utf8"));
  if (!overrides || Array.isArray(overrides) || typeof overrides !== "object") {
    throw new Error("--overrides deve apontar para um objeto JSON por id_cena.");
  }
}

const response = await fetch(`${api}/api/executions/${executionId}/state`);
if (!response.ok) throw new Error(`ContentFlow respondeu HTTP ${response.status}.`);
const { execution } = await response.json();
const mapBlock = execution.blocks.find((item) => item.blockId === "norte-magnata-asset-map-create");
const stockBlock = execution.blocks.find((item) => item.blockId === "norte-magnata-stock-search");
const assets = Array.isArray(mapBlock?.values?.assets) ? mapBlock.values.assets : [];
const productionId = String(stockBlock?.values?.stock_assets?.[0]?.production_id || "");
if (!assets.length || !productionId) throw new Error("Mapa ou production_id ainda não está disponível.");

const eligibleScenes = assets.filter(
  (scene) => scene.midia_principal !== "broll_video" && String(scene.prompt_imagem || "").trim(),
);
const requestedSceneIds = String(args.scenes || "")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
const scenes = requestedSceneIds.length
  ? requestedSceneIds.map((sceneId) => eligibleScenes.find((scene) => scene.id_cena === sceneId)).filter(Boolean)
  : eligibleScenes.slice(0, 5);
if (!scenes.length || scenes.length > 5 || (requestedSceneIds.length && scenes.length !== requestedSceneIds.length)) {
  throw new Error("O lote de teste precisa conter de uma a cinco cenas de imagem válidas.");
}

const root = path.join(
  process.env.HOME,
  "Library/Application Support/ContentFlow OS/data/flow-jobs",
  productionId,
  runSlug,
);
await mkdir(root, { recursive: true });
const promptPath = path.join(root, "lote_001.txt");
const promptText = `${scenes
  .map((scene) => {
    const prompt = guardImagePrompt(overrides[scene.id_cena] || scene.prompt_imagem);
    return `{cena ${scene.id_cena}} ${prompt}`;
  })
  .join("\n\n")}\n`;
const promptLines = promptText.split("\n").filter((line) => line.trim());
if (
  promptLines.length !== scenes.length
  || promptLines.some((line) => !/^\{cena B\d{2,}_C\d{2,}\}\s+\S/.test(line))
) {
  throw new Error("Contrato Flow inválido: cada cena deve ocupar exatamente uma linha.");
}
await writeFile(promptPath, promptText, "utf8");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const runId = `${productionId}_FLOW_${runSlug.replace(/-/g, "_").toUpperCase()}`;
const manifestPath = path.join(root, "manifest_flow.json");
const statePath = path.join(root, "estado_flow.json");
const outputPath = path.join(root, "imagens");
const manifest = {
  id_execucao: runId,
  production_id: productionId,
  mapa_conteudo_sha256: sha256(JSON.stringify(assets)),
  contract_id: "norte_magnata_provedores_video_v3",
  execucao_assets_id: execution.id,
  gerado_em: new Date().toISOString(),
  modelo: "nenhum; prompts aprovados do ContentFlow",
  total_blocos: 1,
  total_prompts: scenes.length,
  formato_marcador_cena: "{cena BXX_CXX}",
  max_prompts_por_lote_flow: 5,
  qa: [],
  lotes: [
    {
      id_lote: "lote_001",
      production_id: productionId,
      mapa_conteudo_sha256: sha256(JSON.stringify(assets)),
      blocos: [...new Set(scenes.map((scene) => scene.id_bloco))],
      cenas: scenes.map((scene) => scene.id_cena),
      marcadores_cenas: scenes.map((scene) => `{cena ${scene.id_cena}}`),
      arquivo_prompts: promptPath,
      arquivo_prompts_sha256: sha256(promptText),
      quantidade_prompts: scenes.length,
    },
  ],
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ manifestPath, statePath, outputPath, scenes: scenes.map((scene) => scene.id_cena) }));
