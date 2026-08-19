import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execute } from "./handler.mjs";

const temp = await mkdtemp(path.join(os.tmpdir(), "norte-assets-"));
try {
  const output = path.join(temp, "output");
  await mkdir(output);
  const srtPath = path.join(temp, "input.srt");
  const cues = Array.from({ length: 80 }, (_, index) => {
    const start = index * 4;
    const end = start + 4;
    const stamp = (value) => `00:${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")},000`;
    return `${index + 1}\n${stamp(start)} --> ${stamp(end)}\nTrecho ${index + 1} com ação concreta.`;
  }).join("\n\n");
  await writeFile(srtPath, cues);
  const services = { signal: AbortSignal.timeout(5000), getSecret: async () => "", resolveInputFile: async () => srtPath, getOutputPath: (name) => path.join(output, name) };
  const created = await execute({ invocation: { mode: "start" }, capabilityId: "plan-scene-map", configuration: { block_count: 8, scenes_per_minute: 12, generated_videos: 30, broll_videos: 11, overlay_scenes: 18, sfx_scenes: 14, text_scenes: 20, simulate: true }, inputs: { srt: { url: "/api/files/test.srt" } } }, services);
  assert.equal(created.status, "success", JSON.stringify(created));
  assert.equal(created.values.assets.filter((scene) => scene.midia_principal === "video_gerado").length, 30);
  for (const scene of created.values.assets) {
    const prompt = scene.prompt_imagem.toLowerCase();
    assert.match(prompt, /no pseudo-text/);
    assert.match(prompt, /no duplicated objects or limbs/);
    assert.match(prompt, /no cropped or disconnected limbs/);
    assert.match(prompt, /must not form extra faces/);
    assert.match(prompt, /no triptych/);
    assert.match(prompt, /no frame-spanning/);
    assert.match(prompt, /no predominantly white/);
    assert.match(prompt, /canonical clean unscarred face/);
  }
  const storedMap = JSON.parse(await readFile(path.join(output, "mapa-assets-norte-magnata.json"), "utf8"));
  const validated = await execute({ invocation: { mode: "start" }, capabilityId: "validate-scene-map", inputs: { assets: created.values.assets, asset_map: { url: "/api/files/map.json" } } }, { ...services, resolveInputFile: async () => path.join(output, "mapa-assets-norte-magnata.json") });
  assert.equal(validated.status, "success");
  assert.equal(validated.values.decision, "approved");
  assert.equal(storedMap.music, "disabled");
  console.log("norte-magnata-asset-map: ok");
} finally {
  await rm(temp, { recursive: true, force: true });
}
