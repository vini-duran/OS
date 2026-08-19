import { readFile, writeFile } from "node:fs/promises";

const API = "https://api.openai.com/v1/responses";
const NONE = new Set(["", "none", "nenhum", "—", "-"]);
const IMAGE_RESTRICTIONS = "Full-bleed cinematic 16:9, scene fills the entire canvas, no readable text, no logos, no brands, no white or off-white border, no mat, no frame, no inset illustration, no blank card, no vertical side bars.";
const IMAGE_RISK_GUARDRAILS = "No pseudo-text, no duplicated objects or limbs, no cropped or disconnected limbs. Any visible screen or paper must be featureless or turned away unless its content will be added later as a validated overlay. Abstract smoke, mist, shadow or light must not form extra faces, people or creatures unless explicitly requested. One single continuous composition, no split screen, no diptych, no triptych, no collage, no comic panels or internal vertical bars. No frame-spanning horizontal or vertical graphic bands, stripes or blank zones. Keep the whole canvas within the dark noir palette; no predominantly white or off-white background.";
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const text = (value) => typeof value === "string" ? value.trim() : "";
const fail = (code, message, retryable = false) => ({ status: "error", code, message, retryable });
const artifact = (id, name, mimeType, size) => ({ id, name, mimeType, size, url: `artifact://${id}` });
const declare = (id, name, mimeType, size) => ({ id, name, mimeType, size, source: { kind: "path", path: name } });

function seconds(value) {
  const match = String(value).replace(".", ",").match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!match) throw new Error(`Timestamp inválido: ${value}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

function timestamp(value) {
  const msTotal = Math.max(0, Math.round(value * 1000));
  const hours = Math.floor(msTotal / 3600000);
  const minutes = Math.floor((msTotal % 3600000) / 60000);
  const secs = Math.floor((msTotal % 60000) / 1000);
  const ms = msTotal % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function parseSrt(source) {
  const cues = [];
  for (const raw of String(source).replace(/\r/g, "").trim().split(/\n\s*\n/)) {
    const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
    const timeLine = lines.find((line) => line.includes("-->"));
    if (!timeLine) continue;
    const [startRaw, endRaw] = timeLine.split("-->").map((item) => item.trim());
    const body = lines.filter((line) => line !== timeLine && !/^\d+$/.test(line)).join(" ").replace(/\s+/g, " ").trim();
    if (!body) continue;
    cues.push({ start: seconds(startRaw), end: seconds(endRaw), text: body });
  }
  cues.sort((left, right) => left.start - right.start);
  if (!cues.length) throw new Error("O SRT não possui trechos válidos.");
  if (cues.some((cue, index) => cue.end <= cue.start || (index && cue.start < cues[index - 1].start))) throw new Error("O SRT contém tempos inválidos.");
  return cues;
}

function closestCueIndex(cues, target, minimum, maximum) {
  let best = minimum;
  for (let index = minimum; index <= maximum; index += 1) {
    if (Math.abs(cues[index].start - target) < Math.abs(cues[best].start - target)) best = index;
  }
  return best;
}

function splitBlocks(cues, count) {
  const fractionsByCount = {
    6: [0, .12, .29, .47, .65, .83, 1],
    7: [0, .11, .24, .38, .53, .69, .85, 1],
    8: [0, .10, .22, .35, .49, .63, .76, .89, 1],
    9: [0, .09, .19, .30, .42, .54, .66, .78, .90, 1],
    10: [0, .08, .17, .27, .37, .47, .58, .69, .80, .90, 1]
  };
  const fractions = fractionsByCount[count];
  const origin = cues[0].start;
  const end = cues.at(-1).end;
  const indexes = [0];
  for (let position = 1; position < count; position += 1) {
    const minimum = indexes.at(-1) + 1;
    const maximum = cues.length - (count - position);
    indexes.push(closestCueIndex(cues, origin + (end - origin) * fractions[position], minimum, maximum));
  }
  indexes.push(cues.length);
  return indexes.slice(0, -1).map((startIndex, index) => {
    const blockCues = cues.slice(startIndex, indexes[index + 1]);
    return {
      id: `B${String(index + 1).padStart(2, "0")}`,
      start: index === 0 ? origin : blockCues[0].start,
      end: index === count - 1 ? end : cues[indexes[index + 1]].start,
      cues: blockCues
    };
  });
}

function splitScenes(block, target) {
  const total = clamp(target, 1, block.cues.length);
  const indexes = [0];
  for (let position = 1; position < total; position += 1) {
    const desired = block.start + (block.end - block.start) * position / total;
    const minimum = indexes.at(-1) + 1;
    const maximum = block.cues.length - (total - position);
    indexes.push(closestCueIndex(block.cues, desired, minimum, maximum));
  }
  indexes.push(block.cues.length);
  return indexes.slice(0, -1).map((startIndex, index) => {
    const grouped = block.cues.slice(startIndex, indexes[index + 1]);
    const start = index === 0 ? block.start : grouped[0].start;
    const end = index === total - 1 ? block.end : block.cues[indexes[index + 1]].start;
    return {
      id_cena: `${block.id}_C${String(index + 1).padStart(2, "0")}`,
      id_bloco: block.id,
      inicio: timestamp(start),
      fim: timestamp(end),
      duracao_seg: Number((end - start).toFixed(3)),
      texto_srt: grouped.map((cue) => cue.text).join(" ")
    };
  });
}

function chooseSlots(total, count, excluded = new Set(), shift = 0) {
  const result = new Set();
  if (count <= 0) return result;
  for (let cursor = 0; cursor < total * 3 && result.size < count; cursor += 1) {
    const position = Math.min(total - 1, Math.floor(((cursor + .5) * total / count + shift) % total));
    if (!excluded.has(position)) result.add(position);
  }
  for (let position = 0; position < total && result.size < count; position += 1) if (!excluded.has(position)) result.add(position);
  return result;
}

function distribute(total, blocks, preferred, capacities = blocks.map((block) => block.scenes.length)) {
  const values = preferred.slice(0, blocks.length).map((value, index) => Math.min(value, capacities[index]));
  while (values.reduce((sum, value) => sum + value, 0) < total) {
    const index = values.findIndex((value, item) => value < capacities[item]);
    if (index < 0) break;
    values[index] += 1;
  }
  while (values.reduce((sum, value) => sum + value, 0) > total) {
    const index = values.findLastIndex((value) => value > 0);
    if (index < 0) break;
    values[index] -= 1;
  }
  return values;
}

function applySlots(blocks, config) {
  const broll = distribute(config.brollVideos, blocks, [2, 2, 2, 1, 1, 1, 1, 1, 1, 1]);
  const videoCapacity = blocks.map((block, index) => Math.max(0, block.scenes.length - broll[index]));
  const video = distribute(config.generatedVideos, blocks, [7, 5, 4, 4, 3, 3, 2, 2, 1, 1], videoCapacity);
  const allScenes = blocks.flatMap((block) => block.scenes);
  blocks.forEach((block, blockIndex) => {
    const videoSlots = chooseSlots(block.scenes.length, video[blockIndex]);
    const brollSlots = chooseSlots(block.scenes.length, broll[blockIndex], videoSlots, 1);
    block.scenes.forEach((scene, index) => {
      scene.midia_principal_exigida = videoSlots.has(index) ? "video_gerado" : brollSlots.has(index) ? "broll_video" : "imagem_animada";
    });
  });
  for (const [field, count, shift] of [["usar_overlay", config.overlayScenes, 0], ["usar_sfx", config.sfxScenes, 2], ["usar_texto", config.textScenes, 4]]) {
    const slots = chooseSlots(allScenes.length, Math.min(count, allScenes.length), new Set(), shift);
    allScenes.forEach((scene, index) => { scene[field] = slots.has(index); });
  }
  return { video, broll };
}

function fallbackScene(base, index) {
  const media = base.midia_principal_exigida;
  const hiro = index % 3 === 0 ? "Tutor" : "ausente";
  return {
    ...base,
    funcao_narrativa: index === 0 ? "hook" : "mecanismo",
    relacao_visual: "mecanismo",
    midia_principal: media,
    estado_hiro: hiro,
    acao_visual: hiro === "ausente" ? "Um objeto concreto muda de posição e revela a consequência da fala." : "[Hiro] executa uma ação física pequena e verificável ligada à fala.",
    composicao: "Plano médio com profundidade, assunto fora do centro e cenário preenchendo todo o quadro.",
    prompt_imagem: `${hiro === "ausente" ? "" : "Use [Hiro] as the exact recurring character. "}Dark noir graphic novel, petroleum blue and charcoal palette. ${IMAGE_RESTRICTIONS} ${IMAGE_RISK_GUARDRAILS}`,
    prompt_video: media === "video_gerado" ? "Start with visible resistance; then the subject performs one dominant physical action; a material object changes; end on the clear consequence. Continuous motion, no loop, no text, no logo." : "nenhum",
    movimento: media === "imagem_animada" ? "push_in com parallax discreto" : "movimento material nativo do vídeo",
    mudanca_interna: base.duracao_seg > 5 ? "A ação muda o objeto e o enquadramento revela a consequência antes do corte." : "revelação curta no final",
    transicao: ["corte_seco", "dissolve_curto", "match_cut", "blur_direcional"][index % 4],
    broll_consulta: media === "broll_video" ? "pessoa iniciando pequena tarefa foco disciplina" : "nenhum",
    broll_funcao: media === "broll_video" ? "evidencia observável da ação narrada" : "nenhum",
    overlay: base.usar_overlay ? ["poeira_sutil", "fumaca_sutil", "particulas_discretas"][index % 3] : "nenhum",
    sfx: base.usar_sfx ? ["impact_baixo", "whoosh_curto", "tick_seco"][index % 3] : "nenhum",
    texto_tela: base.usar_texto ? ["COMECE PEQUENO", "SOB SEU CONTROLE", "ANTES DE ADIAR", "AÇÃO VISÍVEL"][index % 4] : "nenhum",
    criterio_rejeicao: "Rejeitar se houver quadro branco, barras laterais, texto aleatório, personagem passivo, ação sem consequência ou mídia sem movimento material.",
    alerta_antirrepeticao: "Mudar ao menos ação, símbolo e enquadramento em relação às duas cenas anteriores.",
    status: "planejado"
  };
}

function promptForBlock(block, blockIndex, totalBlocks) {
  return `Você é diretor de assets do canal Norte Magnata. Anote cada cena canônica recebida sem alterar id, bloco, início, fim, duração, fala, mídia exigida ou flags.

Identidade: graphic novel dark noir, azul-petróleo, carvão, cinza frio e off-white; Hiro é o personagem recorrente quando necessário. Não copiar símbolos, paleta ou personagens de outros canais.

Regras:
- O áudio/SRT é autoridade temporal. Cada cena cumpre hook, reconhecimento, mecanismo, contraste, consequência, evidência, virada, prática ou fechamento.
- video_gerado exige ação dominante animável, progressão temporal, mudança material e estado final consequente. O prompt deve dizer começo, progressão e final; nunca loop, reversão ou câmera sem ação.
- broll_video demonstra mecanismo, evidência, contraste ou consequência. Forneça consulta de busca objetiva e função; não use stock decorativo.
- imagem_animada exige movimento contínuo. Acima de 5s descreva mudança interna; acima de 10s descreva duas mudanças ou corte interno.
- Se Hiro aparecer, estado_hiro não pode ser ausente, acao_visual e prompt_imagem devem conter [Hiro] e uma ação física.
- Todo prompt de imagem precisa conter literalmente: Full-bleed cinematic 16:9; no readable text; no logos; no brands; no white or off-white border; no mat; no frame; no inset illustration; no blank card; no vertical side bars.
- Evite defeitos observados na prova real: no pseudo-text; no duplicated objects or limbs; no cropped or disconnected limbs. Tela ou papel visível deve ficar sem símbolos ou virado para longe, pois texto/interface só entra depois como overlay validado.
- Fumaça, névoa, sombra e luz abstratas não podem formar rostos, pessoas ou criaturas extras, salvo pedido narrativo explícito.
- A imagem deve ter uma única composição contínua. Proibir split screen, díptico, tríptico, colagem, quadrinhos internos e barras verticais internas.
- Proibir faixas, listras ou zonas vazias horizontais/verticais atravessando o quadro como artefato de layout.
- Declare quantidade exata dos objetos narrativamente importantes. Não acrescente celular, caneca, papel ou notebook como decoração. Não repita a combinação mesa + notebook + caneca em cenas consecutivas.
- Em cada janela de cinco cenas, varie pelo menos três entre: local, escala do plano, ângulo de câmera, ação e objeto dominante. A variação deve servir à progressão causal, não ser aleatória.
- Quando a mídia exigida for video_gerado, prompt_imagem é o quadro inicial limpo da ação descrita em prompt_video: anatomia clara, espaço para o movimento e nenhum resultado final já consumado.
- usar_overlay=false, usar_sfx=false ou usar_texto=false obriga o campo correspondente a "nenhum". Texto permitido tem 1 a 5 palavras e não é legenda.
- Máximo de três camadas totais por cena. SFX baixo e pontual. Não há música.
- Transições 0,36s a 0,72s; não repetir a mesma três vezes. Variar câmera/movimento entre cenas consecutivas.
- A abertura B01 deve funcionar como sequência causal contínua, não clipes independentes.
- Não repetir a fórmula inteira de símbolo, ação, câmera, overlay, SFX, texto e função.

Retorne somente JSON válido: {"funcao_bloco":"...","progressao_visual":"...","cenas":[...]}. Cada cena deve conter exatamente: id_cena, funcao_narrativa, relacao_visual, estado_hiro, acao_visual, composicao, prompt_imagem, prompt_video, movimento, mudanca_interna, transicao, broll_consulta, broll_funcao, overlay, sfx, texto_tela, criterio_rejeicao, alerta_antirrepeticao. Mantenha a ordem e a quantidade. Este é o bloco ${blockIndex + 1}/${totalBlocks}.`;
}

function responseText(body) {
  if (text(body.output_text)) return text(body.output_text);
  return (body.output || []).flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text || "").join("\n").trim();
}

function parseJson(source) {
  return JSON.parse(String(source).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""));
}

async function callModel(key, model, effort, block, index, total, signal) {
  const response = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions: promptForBlock(block, index, total),
      input: JSON.stringify({ id_bloco: block.id, inicio: timestamp(block.start), fim: timestamp(block.end), cenas: block.scenes }),
      reasoning: { effort },
      max_output_tokens: 16000,
      store: false
    }),
    signal
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(text(body?.error?.message) || `OpenAI HTTP ${response.status}`), { status: response.status });
  const parsed = parseJson(responseText(body));
  if (!Array.isArray(parsed.cenas)) throw new Error(`O modelo não retornou cenas para ${block.id}.`);
  return { parsed, usage: body.usage || {}, model: body.model || model };
}

function mergeScenes(block, proposed) {
  const byId = new Map(proposed.map((scene) => [text(scene?.id_cena), scene]));
  return block.scenes.map((base, index) => {
    const model = byId.get(base.id_cena) || {};
    const fallback = fallbackScene(base, index);
    const result = { ...fallback };
    for (const key of ["funcao_narrativa", "relacao_visual", "estado_hiro", "acao_visual", "composicao", "prompt_imagem", "prompt_video", "movimento", "mudanca_interna", "transicao", "broll_consulta", "broll_funcao", "overlay", "sfx", "texto_tela", "criterio_rejeicao", "alerta_antirrepeticao"]) {
      if (text(model[key])) result[key] = text(model[key]);
    }
    result.midia_principal = base.midia_principal_exigida;
    if (!base.usar_overlay) result.overlay = "nenhum";
    if (!base.usar_sfx) result.sfx = "nenhum";
    if (!base.usar_texto) result.texto_tela = "nenhum";
    if (result.midia_principal !== "video_gerado") result.prompt_video = "nenhum";
    if (result.midia_principal !== "broll_video") { result.broll_consulta = "nenhum"; result.broll_funcao = "nenhum"; }
    const normalizedPrompt = text(result.prompt_imagem).toLowerCase();
    if (["full-bleed cinematic 16:9", "no readable text", "no logos", "no brands", "no white or off-white border", "no vertical side bars"].some((token) => !normalizedPrompt.includes(token))) result.prompt_imagem = `${text(result.prompt_imagem)} ${IMAGE_RESTRICTIONS}`.trim();
    const guardedPrompt = text(result.prompt_imagem).toLowerCase();
    if (["no pseudo-text", "no duplicated objects or limbs", "no cropped or disconnected limbs", "must not form extra faces", "no triptych", "no frame-spanning", "no predominantly white"].some((token) => !guardedPrompt.includes(token))) result.prompt_imagem = `${text(result.prompt_imagem)} ${IMAGE_RISK_GUARDRAILS}`.trim();
    if (text(result.estado_hiro).toLowerCase() !== "ausente") {
      if (!text(result.prompt_imagem).includes("[Hiro]")) result.prompt_imagem = `Use [Hiro] as the exact recurring character. ${result.prompt_imagem}`;
      if (!text(result.acao_visual).includes("[Hiro]")) result.acao_visual = `[Hiro] ${text(result.acao_visual)}`.trim();
    }
    result.status = "planejado";
    delete result.midia_principal_exigida;
    delete result.usar_overlay;
    delete result.usar_sfx;
    delete result.usar_texto;
    return result;
  });
}

function metrics(assets) {
  const duration = Math.max(...assets.map((scene) => seconds(scene.fim)));
  const count = (field, value) => assets.filter((scene) => value === undefined ? !NONE.has(text(scene[field]).toLowerCase()) : scene[field] === value).length;
  return {
    duracao_seg: Number(duration.toFixed(3)),
    blocos: new Set(assets.map((scene) => scene.id_bloco)).size,
    cenas: assets.length,
    cenas_por_minuto: Number((assets.length / duration * 60).toFixed(2)),
    duracao_media_cena: Number((assets.reduce((sum, scene) => sum + Number(scene.duracao_seg), 0) / assets.length).toFixed(2)),
    videos_gerados: count("midia_principal", "video_gerado"),
    broll_videos: count("midia_principal", "broll_video"),
    imagens_animadas: count("midia_principal", "imagem_animada"),
    overlays: count("overlay"),
    sfx: count("sfx"),
    textos: count("texto_tela"),
    cenas_acima_5s: assets.filter((scene) => Number(scene.duracao_seg) > 5).length,
    cenas_acima_10s: assets.filter((scene) => Number(scene.duracao_seg) > 10).length
  };
}

function validate(assets, targets) {
  const problems = [];
  const data = metrics(assets);
  if (new Set(assets.map((scene) => scene.id_cena)).size !== assets.length) problems.push("Há IDs de cena duplicados.");
  const ordered = [...assets].sort((left, right) => seconds(left.inicio) - seconds(right.inicio));
  ordered.forEach((scene, index) => {
    const id = scene.id_cena || `cena-${index + 1}`;
    const duration = Number(scene.duracao_seg);
    if (!(duration > 0) || duration > 12) problems.push(`${id}: duração inválida (${duration}s).`);
    if (index && Math.abs(seconds(scene.inicio) - seconds(ordered[index - 1].fim)) > .25) problems.push(`${id}: buraco ou sobreposição temporal.`);
    if (duration > 5 && NONE.has(text(scene.mudanca_interna).toLowerCase())) problems.push(`${id}: cena longa sem mudança interna.`);
    const imagePrompt = text(scene.prompt_imagem).toLowerCase();
    for (const token of ["full-bleed cinematic 16:9", "no readable text", "no logos", "no brands", "no white or off-white border", "no vertical side bars", "no pseudo-text", "no duplicated objects or limbs", "no cropped or disconnected limbs", "must not form extra faces", "no triptych", "no frame-spanning", "no predominantly white"]) if (!imagePrompt.includes(token)) problems.push(`${id}: prompt não bloqueia ${token}.`);
    if (scene.midia_principal === "video_gerado" && (text(scene.prompt_video).length < 100 || NONE.has(text(scene.prompt_video).toLowerCase()))) problems.push(`${id}: vídeo sem progressão temporal executável.`);
    if (scene.midia_principal === "broll_video" && (NONE.has(text(scene.broll_consulta).toLowerCase()) || NONE.has(text(scene.broll_funcao).toLowerCase()))) problems.push(`${id}: B-roll sem consulta/função.`);
    if (text(scene.estado_hiro).toLowerCase() !== "ausente" && (!text(scene.prompt_imagem).includes("[Hiro]") || !text(scene.acao_visual).includes("[Hiro]"))) problems.push(`${id}: Hiro sem identidade/ação explícita.`);
    if (!text(scene.criterio_rejeicao) || !text(scene.alerta_antirrepeticao)) problems.push(`${id}: falta rejeição ou antirrepetição.`);
    const words = text(scene.texto_tela).split(/\s+/).filter(Boolean).length;
    if (!NONE.has(text(scene.texto_tela).toLowerCase()) && words > 5) problems.push(`${id}: texto de tela acima de cinco palavras.`);
    if (index >= 2 && scene.transicao === ordered[index - 1].transicao && scene.transicao === ordered[index - 2].transicao) problems.push(`${id}: terceira transição idêntica consecutiva.`);
  });
  if (data.cenas_por_minuto < 9 || data.cenas_por_minuto > 15) problems.push(`Densidade fora de 9–15 cenas/min (${data.cenas_por_minuto}).`);
  for (const [field, label] of [["videos_gerados", "vídeos gerados"], ["broll_videos", "B-rolls"], ["overlays", "overlays"], ["sfx", "SFX"], ["textos", "textos"]]) if (targets?.[field] !== undefined && data[field] < targets[field]) problems.push(`Meta de ${label} não cumprida (${data[field]}/${targets[field]}).`);
  return { approved: problems.length === 0, problems: [...new Set(problems)], metrics: data };
}

async function createMap(request, services) {
  const file = request.inputs?.srt;
  if (!file || typeof file !== "object") return fail("SRT_REQUIRED", "O SRT real da narração é obrigatório.");
  let cues;
  try { cues = parseSrt(await readFile(await services.resolveInputFile(file), "utf8")); }
  catch (error) { return fail("SRT_INVALID", error instanceof Error ? error.message : "SRT inválido."); }
  const configuration = request.configuration || {};
  const config = {
    blocks: clamp(Number(configuration.block_count || 8), 6, 10),
    scenesPerMinute: clamp(Number(configuration.scenes_per_minute || 12), 9, 15),
    generatedVideos: clamp(Number(configuration.generated_videos || 30), 8, 40),
    brollVideos: clamp(Number(configuration.broll_videos || 11), 4, 20),
    overlayScenes: clamp(Number(configuration.overlay_scenes || 18), 4, 30),
    sfxScenes: clamp(Number(configuration.sfx_scenes || 14), 4, 30),
    textScenes: clamp(Number(configuration.text_scenes || 20), 4, 30)
  };
  const duration = cues.at(-1).end - cues[0].start;
  const targetScenes = Math.round(duration * config.scenesPerMinute / 60);
  const blocks = splitBlocks(cues, config.blocks).map((block) => ({ ...block, scenes: splitScenes(block, Math.round((block.end - block.start) * targetScenes / duration)) }));
  applySlots(blocks, config);
  const simulated = configuration.simulate === true;
  const key = simulated ? "" : text(await services.getSecret("OPENAI_API_KEY"));
  if (!simulated && !key) return fail("OPENAI_API_KEY_REQUIRED", "Conecte OPENAI_API_KEY ao plugin de Mapa de Assets.");
  const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  let finalBlocks = [];
  try {
    const planned = await Promise.all(blocks.map(async (block, index) => {
      let parsed = { funcao_bloco: index === 0 ? "abertura causal" : "desenvolvimento", progressao_visual: "ação, mudança material e consequência", cenas: block.scenes.map(fallbackScene) };
      let blockUsage = {};
      if (!simulated) {
        const result = await callModel(key, text(configuration.model) || "gpt-5.6-terra", ["low", "medium", "high"].includes(configuration.reasoning_effort) ? configuration.reasoning_effort : "medium", block, index, blocks.length, services.signal);
        parsed = result.parsed;
        blockUsage = result.usage;
      }
      return { index, usage: blockUsage, block: { id_bloco: block.id, inicio: timestamp(block.start), fim: timestamp(block.end), funcao_bloco: text(parsed.funcao_bloco), progressao_visual: text(parsed.progressao_visual), cenas: mergeScenes(block, parsed.cenas) } };
    }));
    planned.sort((left, right) => left.index - right.index);
    finalBlocks = planned.map((item) => item.block);
    for (const item of planned) for (const field of Object.keys(usage)) usage[field] += Number(item.usage[field] || 0);
  } catch (error) {
    const status = Number(error?.status || 0);
    return fail(status ? `OPENAI_HTTP_${status}` : "MAP_GENERATION_FAILED", error instanceof Error ? error.message : "Falha ao criar mapa.", status === 429 || status >= 500);
  }
  const assets = finalBlocks.flatMap((block) => block.cenas);
  const targets = { videos_gerados: config.generatedVideos, broll_videos: config.brollVideos, overlays: config.overlayScenes, sfx: config.sfxScenes, textos: config.textScenes };
  const audit = validate(assets, targets);
  if (!audit.approved) return fail("ASSET_MAP_QA_FAILED", `Mapa bloqueado por QA determinístico: ${audit.problems.slice(0, 12).join(" | ")}`);
  const map = { version: "norte_magnata_assets_v1", created_at: new Date().toISOString(), authority: "SRT real da narração", music: "disabled", targets, metrics: audit.metrics, blocks: finalBlocks };
  const content = `${JSON.stringify(map, null, 2)}\n`;
  const name = "mapa-assets-norte-magnata.json";
  const size = Buffer.byteLength(content);
  await writeFile(services.getOutputPath(name), content, "utf8");
  return {
    status: "success",
    values: { assets, asset_map: artifact("norte-magnata-asset-map", name, "application/json", size), asset_report: `${audit.metrics.blocos} blocos; ${audit.metrics.cenas} cenas; ${audit.metrics.cenas_por_minuto} cenas/min; ${audit.metrics.videos_gerados} vídeos gerados; ${audit.metrics.broll_videos} B-rolls; ${audit.metrics.overlays} overlays; ${audit.metrics.sfx} SFX; ${audit.metrics.textos} textos; música desativada.` },
    artifacts: [declare("norte-magnata-asset-map", name, "application/json", size)],
    usage: simulated ? undefined : { provider: "OpenAI", model: text(configuration.model) || "gpt-5.6-terra", unit: "tokens", inputUnits: usage.input_tokens, outputUnits: usage.output_tokens, totalUnits: usage.total_tokens }
  };
}

async function validateMap(request, services) {
  const assets = Array.isArray(request.inputs?.assets) ? request.inputs.assets : [];
  if (!assets.length) return fail("ASSETS_REQUIRED", "O mapa de cenas é obrigatório.");
  let targets;
  if (request.inputs?.asset_map && typeof request.inputs.asset_map === "object") {
    try { targets = JSON.parse(await readFile(await services.resolveInputFile(request.inputs.asset_map), "utf8")).targets; }
    catch { return fail("ASSET_MAP_INVALID", "O JSON canônico do mapa não pôde ser validado."); }
  }
  const audit = validate(assets, targets);
  const report = audit.approved ? `APROVADO. ${audit.metrics.cenas} cenas cobrem ${audit.metrics.duracao_seg}s sem buracos; ${audit.metrics.videos_gerados} vídeos gerados, ${audit.metrics.broll_videos} B-rolls, ${audit.metrics.overlays} overlays e ${audit.metrics.sfx} SFX planejados. Música desativada.` : `REPROVADO. ${audit.problems.slice(0, 30).join(" | ")}`;
  return { status: "success", values: { decision: audit.approved ? "approved" : "rejected", validation_report: report, asset_metrics: JSON.stringify(audit.metrics) } };
}

export async function execute(request, services) {
  if (request.invocation?.mode !== "start") return fail("INVALID_INVOCATION", "Capacidade imediata.");
  if (request.capabilityId === "plan-scene-map") return createMap(request, services);
  if (request.capabilityId === "validate-scene-map") return validateMap(request, services);
  return fail("CAPABILITY_NOT_FOUND", "Capacidade desconhecida.");
}
