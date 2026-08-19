import path from "node:path";
import { readFile, stat } from "node:fs/promises";

const FILES = {
  dolaManifest: "Automacao_Dola_Videos/02_saida/manifest_dola_videos.json",
  dolaState: "Automacao_Dola_Videos/05_estado/estado_dola.json",
  dolaBridge: "Automacao_Dola_Videos/05_estado/bridge_dola_app.json",
  flowManifest: "Automacao_Videos_Flow/02_saida/manifest_video_flow.json",
  flowUploads: "Automacao_Videos_Flow/02_saida/referencias_upload_flow.json",
  editingState: "Automacao_Edicao/11_estado/etapa_atual.json"
};

function rootFrom(services) {
  return path.dirname(services.getWorkspacePath(".norte-magnata-monitor-root"));
}

function safePath(root, relativePath) {
  const target = path.resolve(root, relativePath);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Caminho de estado inválido.");
  return target;
}

async function readJson(root, relativePath) {
  try {
    const file = safePath(root, relativePath);
    const [raw, metadata] = await Promise.all([readFile(file, "utf8"), stat(file)]);
    return { value: JSON.parse(raw), updatedAt: metadata.mtime.toISOString(), source: relativePath };
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    return { error: error instanceof Error ? error.message : String(error), source: relativePath };
  }
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function statusCount(items, keys) {
  const counts = new Map();
  for (const item of items) {
    const key = keys.map((name) => item?.[name]).find((value) => typeof value === "string" && value.trim());
    const status = key || "sem_status";
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  return [...counts.entries()].map(([key, value]) => `${key}: ${value}`).join("; ");
}

function productionId(...documents) {
  for (const document of documents) {
    const value = document?.value?.production_id;
    if (typeof value === "string" && value) return value;
  }
  return "não identificado";
}

function dolaSessions(bridge) {
  const clients = bridge?.value?.clients;
  if (!clients || typeof clients !== "object" || Array.isArray(clients)) return undefined;
  const workers = Object.values(clients).filter((item) => item?.client_role === "content_worker" && item?.online !== false);
  const profiles = new Map();
  for (const worker of workers) {
    const profile = worker.chrome_profile_directory || "perfil desconhecido";
    const current = profiles.get(profile) || { healthy: 0, authRequired: 0, total: 0 };
    current.total += 1;
    if (worker.session_state === "healthy" && worker.session_authenticated === true && worker.session_submit_allowed === true) current.healthy += 1;
    if (worker.session_state === "auth_required") current.authRequired += 1;
    profiles.set(profile, current);
  }
  const healthyProfiles = [...profiles.values()].filter((item) => item.healthy > 0).length;
  const authProfiles = [...profiles.entries()].filter(([, item]) => item.authRequired > 0).map(([name]) => name);
  const healthyTabs = [...profiles.values()].reduce((total, item) => total + item.healthy, 0);
  return { profiles: profiles.size, healthyProfiles, healthyTabs, authProfiles };
}

function row(etapa, provedor, estado, progresso, proximaAcao, atualizadoEm, fonte) {
  return { etapa, provedor, estado, progresso, proxima_acao: proximaAcao, atualizado_em: atualizadoEm || "", fonte };
}

export async function execute(_request, services) {
  const root = rootFrom(services);
  const entries = await Promise.all(Object.entries(FILES).map(async ([key, file]) => [key, await readJson(root, file)]));
  const docs = Object.fromEntries(entries);
  const id = productionId(docs.dolaManifest, docs.flowManifest, docs.dolaState);
  const rows = [];

  const flowLots = array(docs.flowManifest?.value?.lotes);
  rows.push(row(
    "Geração de vídeos",
    "Flow",
    docs.flowManifest?.error ? "erro de leitura" : (docs.flowManifest?.value?.status || "não preparada"),
    `${flowLots.length} cenas — ${statusCount(flowLots, ["status_video_flow", "status"]) || "sem lotes"}`,
    flowLots.length ? "Gerar e materializar os vídeos canônicos do Flow" : "Preparar o manifesto Flow",
    docs.flowManifest?.updatedAt,
    FILES.flowManifest
  ));

  const dolaScenes = array(docs.dolaManifest?.value?.cenas);
  const seconds = dolaScenes.reduce((total, scene) => total + (Number(scene?.duracao_dola_seg) || 0), 0);
  const sessions = dolaSessions(docs.dolaBridge);
  const dolaState = docs.dolaState?.value?.status || docs.dolaManifest?.value?.status || "não preparada";
  const capacity = sessions
    ? `${sessions.healthyProfiles}/5 perfis saudáveis; ${sessions.healthyTabs} guias saudáveis; ${seconds}/100 s alocados`
    : `${seconds}/100 s alocados; sessão ao vivo indisponível`;
  const nextDola = sessions?.authProfiles?.length
    ? `Fazer login em ${sessions.authProfiles.join(", ")}; depois repetir o preflight integral`
    : sessions?.healthyProfiles === 5
      ? "Capacidade integral disponível; fila pode ser iniciada"
      : "Abrir todos os perfis e manter as janelas visíveis";
  rows.push(row(
    "Geração de vídeos",
    "Dola",
    dolaState,
    `${dolaScenes.length} cenas — ${capacity} — ${statusCount(dolaScenes, ["status"]) || "sem cenas"}`,
    nextDola,
    docs.dolaBridge?.updatedAt || docs.dolaState?.updatedAt || docs.dolaManifest?.updatedAt,
    FILES.dolaBridge
  ));

  const uploadItems = array(docs.flowUploads?.value?.referencias || docs.flowUploads?.value?.arquivos || docs.flowUploads?.value?.itens);
  rows.push(row(
    "Materialização e handoff",
    "Flow + Dola",
    "aguardando vídeos canônicos",
    `${flowLots.length + dolaScenes.length}/50 cenas planejadas; ${uploadItems.length || flowLots.length} referências Flow registradas`,
    "Validar hash, duração e decode de cada vídeo antes da Edição",
    docs.flowUploads?.updatedAt || docs.flowManifest?.updatedAt,
    FILES.flowUploads
  ));

  const editing = docs.editingState?.value || {};
  rows.push(row(
    "Edição e renderização",
    "Editor",
    editing.status || "não iniciada",
    editing.portao_atual ? `Portão ${editing.portao_atual}` : "Sem portão ativo",
    "Iniciar somente após os 50 vídeos canônicos e o handoff aprovados",
    docs.editingState?.updatedAt || editing.atualizado_em,
    FILES.editingState
  ));

  const readErrors = Object.values(docs).filter((item) => item?.error).map((item) => `${item.source}: ${item.error}`);
  const summary = [
    `Produção ${id}.`,
    `Plano: ${flowLots.length} vídeos Flow + ${dolaScenes.length} vídeos Dola (${seconds} s Dola).`,
    sessions ? `Dola ao vivo: ${sessions.healthyProfiles}/5 perfis e ${sessions.healthyTabs} guias saudáveis.` : "Dola ao vivo: estado indisponível.",
    sessions?.authProfiles?.length ? `Bloqueio: login necessário em ${sessions.authProfiles.join(", ")}.` : "Nenhum perfil marcado como auth_required.",
    "Este monitor é somente leitura: não inicia fila, não chama API e não renderiza.",
    readErrors.length ? `Alertas de leitura: ${readErrors.join(" | ")}` : "Arquivos monitorados lidos sem erro."
  ].join("\n");

  return { status: "success", values: { production_state: rows, production_summary: summary } };
}
