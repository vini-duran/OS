#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key.startsWith("--")) continue;
    const next = values[index + 1];
    if (!next || next.startsWith("--")) result[key.slice(2)] = true;
    else { result[key.slice(2)] = next; index += 1; }
  }
  return result;
}

function jpegDimensions(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error("Arquivo não é JPEG válido.");
  const startsOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  for (let index = 2; index + 8 < buffer.length;) {
    if (buffer[index] !== 0xff) { index += 1; continue; }
    const marker = buffer[index + 1];
    if (startsOfFrame.has(marker)) {
      return { height: buffer.readUInt16BE(index + 5), width: buffer.readUInt16BE(index + 7) };
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const length = buffer.readUInt16BE(index + 2);
    if (length < 2) throw new Error("Segmento JPEG inválido.");
    index += 2 + length;
  }
  throw new Error("Dimensões JPEG não encontradas.");
}

const args = parseArgs(process.argv.slice(2));
const api = String(args.api || "").replace(/\/$/, "");
const executionId = String(args.execution || "");
const runSlug = String(args.run || "");
const approvalPath = path.resolve(String(args.approved || ""));
const sceneIds = String(args.scenes || "").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(api) || !executionId || !/^smoke-\d{3}$/.test(runSlug)) {
  throw new Error("Informe --api local, --execution e --run smoke-NNN.");
}
if (!sceneIds.length || sceneIds.length > 5 || new Set(sceneIds).size !== sceneIds.length) {
  throw new Error("--scenes deve conter de uma a cinco cenas únicas.");
}
if (args["confirm-visual"] !== "APROVADO") {
  throw new Error("O registro exige --confirm-visual APROVADO após inspeção humana/Codex.");
}

const response = await fetch(`${api}/api/executions/${executionId}/state`);
if (!response.ok) throw new Error(`ContentFlow respondeu HTTP ${response.status}.`);
const { execution } = await response.json();
const mapBlock = execution.blocks.find((item) => item.blockId === "norte-magnata-asset-map-create");
const assets = Array.isArray(mapBlock?.values?.assets) ? mapBlock.values.assets : [];
const byId = new Map(assets.map((scene) => [scene.id_cena, scene]));
const approval = JSON.parse(await readFile(approvalPath, "utf8"));
const jobRoot = path.dirname(path.dirname(approvalPath));
const runId = `${approval.production_id}_FLOW_${runSlug.replace(/-/g, "_").toUpperCase()}`;
const runRoot = path.join(jobRoot, runSlug, "imagens", runId);
const additions = [];

for (const sceneId of sceneIds) {
  const scene = byId.get(sceneId);
  if (!scene || scene.midia_principal === "broll_video") throw new Error(`${sceneId} não é cena válida de imagem-base.`);
  const blockId = String(scene.id_bloco || sceneId.split("_")[0]);
  const sidecarPath = path.join(runRoot, blockId, sceneId, `${sceneId}_manifesto_imagens.json`);
  const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
  if (sidecar.production_id !== approval.production_id || sidecar.mapa_conteudo_sha256 !== approval.mapa_conteudo_sha256) {
    throw new Error(`${sceneId}: identidade do sidecar diverge do manifesto aprovado.`);
  }
  const imagePath = path.resolve(String(sidecar.imagens?.[0]?.arquivo || ""));
  if (!imagePath.startsWith(`${path.resolve(runRoot)}${path.sep}`)) throw new Error(`${sceneId}: mídia fora da rodada informada.`);
  const bytes = await readFile(imagePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== sidecar.imagens?.[0]?.sha256) throw new Error(`${sceneId}: hash diverge do sidecar.`);
  const dimensions = jpegDimensions(bytes);
  if (dimensions.width !== 1376 || dimensions.height !== 768) throw new Error(`${sceneId}: dimensão inesperada ${dimensions.width}x${dimensions.height}.`);
  additions.push({
    id_cena: sceneId,
    origem_run: runSlug,
    arquivo: imagePath,
    sha256,
    destino_editorial: scene.midia_principal === "video_gerado" ? "quadro_inicial_video_gerado" : "imagem_animada",
  });
}

const merged = new Map((approval.cenas || []).map((scene) => [scene.id_cena, scene]));
for (const scene of additions) merged.set(scene.id_cena, scene);
approval.cenas = [...merged.values()].sort((left, right) => left.id_cena.localeCompare(right.id_cena));
approval.aprovado_em = new Date().toISOString();
approval.qa.total = approval.cenas.length;
for (const key of ["dimensoes", "proporcao", "hash_sidecar", "arquivos_unicos"]) {
  const label = { dimensoes: "em 1376x768", proporcao: "em 16:9", hash_sidecar: "correspondentes", arquivos_unicos: "únicos" }[key];
  approval.qa[key] = `${approval.cenas.length}/${approval.cenas.length} ${label}`;
}
approval.qa.borda_branca = `0/${approval.cenas.length}; confirmação visual obrigatória por lote`;

const summary = {
  dry_run: args["dry-run"] === true,
  adicionadas: additions.map((scene) => scene.id_cena),
  total_aprovadas: approval.cenas.length,
  quadros_video: approval.cenas.filter((scene) => scene.destino_editorial === "quadro_inicial_video_gerado").length,
  imagens_animadas: approval.cenas.filter((scene) => scene.destino_editorial === "imagem_animada").length,
};
if (args["dry-run"] !== true) {
  const temporary = `${approvalPath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(approval, null, 2)}\n`, "utf8");
  await rename(temporary, approvalPath);
}
console.log(JSON.stringify(summary));
