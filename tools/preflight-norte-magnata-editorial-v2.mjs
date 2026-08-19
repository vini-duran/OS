#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NONE = new Set(["", "nenhum", "none", "null"]);

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key.startsWith("--")) continue;
    const next = values[index + 1];
    if (!next || next.startsWith("--")) result[key.slice(2)] = true;
    else {
      result[key.slice(2)] = next;
      index += 1;
    }
  }
  return result;
}

function seconds(stamp) {
  const match = /^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(String(stamp));
  if (!match) throw new Error(`Timestamp inválido: ${stamp}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function nonempty(value) {
  return !NONE.has(String(value || "").trim().toLowerCase());
}

export async function runEditorialV2Preflight({ mapPath, approvalPath, planPath }) {
  const [mapBytes, approvalBytes, planBytes] = await Promise.all([
    readFile(mapPath),
    readFile(approvalPath),
    readFile(planPath),
  ]);
  const map = JSON.parse(mapBytes);
  const approval = JSON.parse(approvalBytes);
  const plan = JSON.parse(planBytes);
  const scenes = (map.blocks || []).flatMap((block) => block.cenas || []);
  const byId = new Map(scenes.map((scene) => [scene.id_cena, scene]));
  const approvedById = new Map((approval.cenas || []).map((scene) => [scene.id_cena, scene]));
  const problems = [];
  const warnings = [];

  if (approval.production_id !== plan.production_id) problems.push("production_id diverge entre manifesto e plano V2.");
  if (approval.mapa_conteudo_sha256 !== plan.mapa_conteudo_sha256) problems.push("hash canônico diverge entre manifesto e plano V2.");
  if (scenes.length !== 98) problems.push(`Mapa deveria conter 98 cenas, encontrou ${scenes.length}.`);

  let previousEnd = null;
  for (const scene of scenes) {
    const start = seconds(scene.inicio);
    const end = seconds(scene.fim);
    if (end <= start) problems.push(`${scene.id_cena}: duração inválida.`);
    if (previousEnd !== null && Math.abs(start - previousEnd) > 0.002) problems.push(`${scene.id_cena}: quebra temporal de ${(start - previousEnd).toFixed(3)}s.`);
    previousEnd = end;
  }

  const generatedNow = scenes.filter((scene) => scene.midia_principal === "video_gerado");
  const broll = scenes.filter((scene) => scene.midia_principal === "broll_video");
  const stills = scenes.filter((scene) => scene.midia_principal === "imagem_animada");
  const promotionIds = new Set();
  const videoQueue = [];
  for (const item of plan.promote_to_generated_video || []) {
    const scene = byId.get(item.scene_id);
    if (!scene) {
      problems.push(`${item.scene_id}: promoção aponta para cena inexistente.`);
      continue;
    }
    if (promotionIds.has(item.scene_id)) problems.push(`${item.scene_id}: promoção duplicada.`);
    promotionIds.add(item.scene_id);
    if (scene.midia_principal !== "imagem_animada") problems.push(`${item.scene_id}: promoção não parte de imagem animada.`);
    if (!/começo|come[cç]ar/i.test(item.prompt_video_v2) || !/progress[aã]o/i.test(item.prompt_video_v2) || !/final/i.test(item.prompt_video_v2)) {
      problems.push(`${item.scene_id}: prompt V2 não declara começo, progressão e final.`);
    }
    const approved = approvedById.get(item.scene_id);
    if (!approved) {
      problems.push(`${item.scene_id}: quadro inicial não consta do manifesto aprovado.`);
      continue;
    }
    const bytes = await readFile(approved.arquivo);
    if (sha256(bytes) !== approved.sha256) problems.push(`${item.scene_id}: hash do quadro inicial diverge do manifesto.`);
    videoQueue.push({
      scene_id: item.scene_id,
      block_id: scene.id_bloco,
      start: scene.inicio,
      end: scene.fim,
      duration_seconds: scene.duracao_seg,
      source_image: approved.arquivo,
      source_sha256: approved.sha256,
      prompt_video: item.prompt_video_v2,
      reason: item.reason,
      status: "ready_not_started",
    });
  }

  const expectedBaseIds = scenes.filter((scene) => scene.midia_principal !== "broll_video").map((scene) => scene.id_cena);
  for (const sceneId of expectedBaseIds) if (!approvedById.has(sceneId)) problems.push(`${sceneId}: imagem-base ausente do manifesto.`);
  if (new Set([...approvedById.values()].map((scene) => scene.sha256)).size !== approvedById.size) problems.push("Manifesto contém imagens-base com hash repetido.");

  for (const scene of stills.filter((item) => !promotionIds.has(item.id_cena))) {
    if (!nonempty(scene.movimento)) problems.push(`${scene.id_cena}: imagem restante sem movimento base.`);
    if (Number(scene.duracao_seg) > 5 && !nonempty(scene.mudanca_interna)) problems.push(`${scene.id_cena}: imagem longa sem desenvolvimento interno.`);
    if (Number(scene.duracao_seg) > 10 && !/duas|corte interno|depois|primeiro/i.test(String(scene.mudanca_interna || ""))) {
      problems.push(`${scene.id_cena}: imagem acima de 10s sem duas mudanças ou corte.`);
    }
  }

  for (const item of plan.light_area_review || []) {
    if (!promotionIds.has(item.scene_id) || !nonempty(item.resolution)) problems.push(`${item.scene_id}: área clara sem tratamento V2 executável.`);
  }
  for (const item of [...(plan.chapter_devices || []), ...(plan.additional_editorial_overlays || []), ...(plan.additional_sfx || [])]) {
    if (!byId.has(item.scene_id)) problems.push(`${item.scene_id}: tratamento aponta para cena inexistente.`);
  }

  const currentMovingSeconds = [...generatedNow, ...broll].reduce((total, scene) => total + Number(scene.duracao_seg), 0);
  const promotedSeconds = scenes.filter((scene) => promotionIds.has(scene.id_cena)).reduce((total, scene) => total + Number(scene.duracao_seg), 0);
  const duration = Number(map.metrics?.duracao_seg || previousEnd || 0);
  const movingRatio = duration ? (currentMovingSeconds + promotedSeconds) / duration : 0;
  const generatedTarget = generatedNow.length + promotionIds.size;
  if (generatedTarget !== Number(plan.generated_video_target)) problems.push(`Alvo de vídeos diverge (${generatedTarget}/${plan.generated_video_target}).`);
  if (movingRatio + 1e-9 < Number(plan.moving_timeline_minimum_ratio)) problems.push(`Cobertura móvel insuficiente (${(movingRatio * 100).toFixed(2)}%).`);
  if ((plan.additional_sfx || []).length + Number(map.metrics?.sfx || 0) < 20) warnings.push("Densidade de SFX continua abaixo de 20 eventos.");

  const remainingLongStills = stills
    .filter((scene) => !promotionIds.has(scene.id_cena) && Number(scene.duracao_seg) > 5)
    .map((scene) => ({ scene_id: scene.id_cena, duration_seconds: scene.duracao_seg, internal_change: scene.mudanca_interna }));
  const result = {
    schema_version: 1,
    contract_id: plan.contract_id,
    production_id: plan.production_id,
    checked_at: new Date().toISOString(),
    dry_run: true,
    generation_started: false,
    full_queue_ready: problems.length === 0,
    decision: problems.length ? "blocked" : "approved_for_full_queue",
    metrics: {
      duration_seconds: duration,
      scenes: scenes.length,
      generated_videos_before: generatedNow.length,
      generated_videos_after: generatedTarget,
      broll_videos: broll.length,
      animated_images_after: stills.length - promotionIds.size,
      moving_timeline_ratio_before: Number((currentMovingSeconds / duration).toFixed(4)),
      moving_timeline_ratio_after: Number(movingRatio.toFixed(4)),
      editorial_overlays_after: Number(map.metrics?.overlays || 0) + (plan.additional_editorial_overlays || []).length,
      sfx_after: Number(map.metrics?.sfx || 0) + (plan.additional_sfx || []).length,
      chapter_devices: (plan.chapter_devices || []).length,
      remaining_long_stills: remainingLongStills.length,
    },
    problems,
    warnings,
    light_area_review: plan.light_area_review,
    remaining_long_stills: remainingLongStills,
    full_video_queue: videoQueue,
  };
  return result;
}

async function atomicJson(destination, value) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const mapPath = path.resolve(String(args.map || ""));
  const approvalPath = path.resolve(String(args.approval || ""));
  const planPath = path.resolve(String(args.plan || ""));
  if (!args.map || !args.approval || !args.plan) throw new Error("Uso: --map MAPA.json --approval MANIFESTO.json --plan V2.json [--output PREFLIGHT.json]");
  const result = await runEditorialV2Preflight({ mapPath, approvalPath, planPath });
  if (args.output) await atomicJson(path.resolve(String(args.output)), result);
  console.log(JSON.stringify({
    decision: result.decision,
    full_queue_ready: result.full_queue_ready,
    generation_started: result.generation_started,
    metrics: result.metrics,
    problems: result.problems,
    output: args.output ? path.resolve(String(args.output)) : null,
  }));
  if (!result.full_queue_ready) process.exitCode = 1;
}
