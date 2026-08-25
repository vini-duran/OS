import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execute } from "./handler.mjs";

const root = await mkdtemp(join(tmpdir(), "nm-orchestrator-"));
await mkdir(join(root, "Automacao_Prompts_Flow/05_estado"), { recursive: true });
await mkdir(join(root, "Automacao_Prompts_Flow/02_saida/densidade_ampliada/mapa"), { recursive: true });
await writeFile(join(root, "Automacao_Prompts_Flow/05_estado/estado_flow.json"), JSON.stringify({ status: { lote_001: "concluido", lote_002: "pendente" } }));
await writeFile(join(root, "Automacao_Prompts_Flow/02_saida/densidade_ampliada/mapa/manifesto_ampliacao.json"), JSON.stringify({ production_id: "NM-TESTE", cenas_antes: 67, cenas_alvo: 171, cenas_adicionadas: 104, preserva_midias_existentes: true }));
const response = await execute({ capabilityId: "run-current-production-step", configuration: { mode: "inspect", simulate: true } }, { getWorkspacePath: (value) => join(root, value) });
assert.equal(response.status, "success");
assert.match(response.values.orchestration_status, /"scenesTarget": 171/);
console.log("production-orchestrator: inspeção offline aprovada");
