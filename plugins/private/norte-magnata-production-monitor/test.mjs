import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execute } from "./handler.mjs";

const root = await mkdtemp(path.join(tmpdir(), "norte-monitor-"));
const write = async (relative, value) => {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(value));
};

await write("Automacao_Videos_Flow/02_saida/manifest_video_flow.json", {
  production_id: "NM-CF-0123456789ABCDEF",
  status: "prompts_refinados",
  lotes: [{ status_video_flow: "aprovada_para_preparar_flow" }]
});
await write("Automacao_Dola_Videos/02_saida/manifest_dola_videos.json", {
  production_id: "NM-CF-0123456789ABCDEF",
  status: "fallback_local_aprovado",
  cenas: [{ duracao_dola_seg: 20, status: "pendente_dola" }]
});
await write("Automacao_Dola_Videos/05_estado/bridge_dola_app.json", {
  clients: {
    a: { client_role: "content_worker", online: true, chrome_profile_directory: "Profile 18", session_state: "healthy", session_authenticated: true, session_submit_allowed: true },
    b: { client_role: "content_worker", online: true, chrome_profile_directory: "Profile 25", session_state: "auth_required", session_authenticated: false, session_submit_allowed: false }
  }
});

const result = await execute({}, { getWorkspacePath: () => path.join(root, ".norte-magnata-monitor-root") });
assert.equal(result.status, "success");
assert.equal(result.values.production_state.length, 4);
assert.match(result.values.production_summary, /Profile 25/);
assert.match(result.values.production_state[1].proxima_acao, /login/i);
console.log("norte-magnata-production-monitor: ok");
