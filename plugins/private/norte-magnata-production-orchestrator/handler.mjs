import { spawn } from "node:child_process";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import { basename } from "node:path";

class PluginFailure extends Error {
  constructor(code, message, retryable = false) { super(message); this.code = code; this.retryable = retryable; }
}

const filesForMode = {
  continue_expanded: "Automacao_Prompts_Flow/CONTINUAR_DENSIDADE_AMPLIADA.command",
  resume_current: "Automacao_Prompts_Flow/RETOMAR_GERACAO_ATUAL.command",
};

async function exists(path) { try { await access(path); return true; } catch { return false; } }

async function inspect(services) {
  const statePath = services.getWorkspacePath("Automacao_Prompts_Flow/05_estado/estado_flow.json");
  const expansionPath = services.getWorkspacePath("Automacao_Prompts_Flow/02_saida/densidade_ampliada/mapa/manifesto_ampliacao.json");
  let state = {}, expansion = {};
  if (await exists(statePath)) state = JSON.parse(await readFile(statePath, "utf8"));
  if (await exists(expansionPath)) expansion = JSON.parse(await readFile(expansionPath, "utf8"));
  const statuses = Object.values(state.status ?? {});
  const complete = statuses.filter((value) => String(value).startsWith("concluido")).length;
  return {
    productionId: expansion.production_id ?? state.production_id ?? "NM-150BE1CA47573B4B",
    currentBatches: statuses.length,
    completedBatches: complete,
    scenesBefore: expansion.cenas_antes ?? 67,
    scenesTarget: expansion.cenas_alvo ?? 171,
    scenesAdded: expansion.cenas_adicionadas ?? 104,
    preservesMedia: expansion.preserva_midias_existentes !== false,
  };
}

async function runCommand(command, signal) {
  return await new Promise((resolve, reject) => {
    const child = spawn("/bin/zsh", [command], { cwd: command.slice(0, command.lastIndexOf("/")), stdio: ["ignore", "pipe", "pipe"], shell: false });
    let output = "";
    const append = (chunk) => { output = (output + chunk).slice(-50000); };
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", append); child.stderr.on("data", append);
    const cancel = () => { try { child.kill("SIGINT"); } catch {} };
    signal?.addEventListener("abort", cancel, { once: true });
    child.once("error", reject);
    child.once("close", (code) => { signal?.removeEventListener("abort", cancel); resolve({ code, output }); });
  });
}

async function artifact(path, services, id) {
  if (!await exists(path)) return null;
  const data = await readFile(path); const name = basename(path); const output = services.getOutputPath(name);
  await writeFile(output, data); const info = await stat(output);
  return { value: { id, name, mimeType: "application/json", size: info.size, url: `artifact://${id}` }, artifact: { id, name, mimeType: "application/json", size: info.size, source: { kind: "path", path: name } } };
}

export async function execute(request, services) {
  if (request.capabilityId !== "run-current-production-step") throw new PluginFailure("INVALID_INPUT", "Capacidade desconhecida.");
  const mode = request.configuration?.mode ?? "continue_expanded";
  const before = await inspect(services);
  if (request.configuration?.simulate || mode === "inspect") {
    return { status: "success", values: { orchestration_status: JSON.stringify({ mode, ...before }, null, 2), production_files: [] }, artifacts: [], logs: ["Inspeção local concluída; nenhuma produção iniciada."] };
  }
  const relative = filesForMode[mode];
  if (!relative) throw new PluginFailure("INVALID_CONFIGURATION", `Modo inválido: ${mode}`);
  const command = services.getWorkspacePath(relative);
  if (!await exists(command)) throw new PluginFailure("INVALID_CONFIGURATION", `Automação não encontrada no workspace configurado: ${relative}`);
  const result = await runCommand(command, request.signal);
  const after = await inspect(services);
  const manifestPath = services.getWorkspacePath("Automacao_Prompts_Flow/02_saida/densidade_ampliada/mapa/manifesto_ampliacao.json");
  const found = await artifact(manifestPath, services, "density-manifest");
  const summary = JSON.stringify({ mode, exitCode: result.code, before, after, recentLog: result.output.slice(-6000) }, null, 2);
  if (result.code !== 0) throw new PluginFailure("PRODUCTION_STEP_FAILED", summary, true);
  return { status: "success", values: { orchestration_status: summary, production_files: found ? [found.value] : [] }, artifacts: found ? [found.artifact] : [], logs: ["Etapa executada pelo orquestrador provisório dentro do ContentFlow OS."] };
}
