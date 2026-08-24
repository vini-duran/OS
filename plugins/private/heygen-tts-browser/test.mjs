import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "./handler.mjs";

const invalid = await execute(
  { capabilityId: "generate-browser-tts", inputs: { script: "" }, configuration: {} },
  { getOutputPath: () => "unused" },
);
assert.equal(invalid.status, "error");
assert.equal(invalid.code, "INVALID_INPUT");

const directory = await mkdtemp(join(tmpdir(), "heygen-plugin-"));
const port = 19002 + Math.floor(Math.random() * 1000);
const execution = execute(
  {
    capabilityId: "generate-browser-tts",
    executionId: "offline-test",
    inputs: { script: "Texto de teste suficiente para validar o contrato local." },
    configuration: { voiceId: "voice_test_123", rate: 1, pitch: 0, bridgePort: port },
  },
  { getOutputPath: (name) => join(directory, name) },
);

await new Promise((resolve) => setTimeout(resolve, 100));
const socket = new WebSocket(`ws://127.0.0.1:${port}`);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
socket.send(JSON.stringify({ type: "extension_ready" }));
socket.onmessage = (event) => {
  const request = JSON.parse(event.data);
  if (request.type !== "generate-tts") return;
  const audio = Buffer.from("ID3-contentflow-offline-test").toString("base64");
  socket.send(JSON.stringify({
    type: "tts-block-ready", jobId: request.jobId, blockIndex: 0, totalBlocks: 1,
    audioUrl: null, audioChunks: [audio], format: "mp3",
  }));
  socket.send(JSON.stringify({ id: request.id, status: 200, data: { success: true, totalBlocks: 1 }, error: null }));
};

const result = await execution;
assert.equal(result.status, "success");
assert.equal(result.values.audio.mimeType, "audio/mpeg");
assert.ok(result.values.audio.size > 0);
assert.match((await readFile(join(directory, result.values.audio.name))).toString(), /contentflow-offline-test/);
socket.close();
await rm(directory, { recursive: true, force: true });
console.log("heygen-tts-browser: ok");
