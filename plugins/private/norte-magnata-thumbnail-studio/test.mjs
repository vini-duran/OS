import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execute } from "./handler.mjs";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Jxd0AAAAASUVORK5CYII=", "base64");
const baseRequest = {
  invocation: { mode: "start" },
  capabilityId: "generate-16x9-thumbnail",
  configuration: { quality: "high", visual_direction: "Fotografia sóbria." },
  inputs: { title: "Disciplina sem motivação", theme: "Ação deliberada mesmo quando a vontade oscila." },
};

const originalFetch = globalThis.fetch;
try {
  const missingTitle = await execute({ ...baseRequest, inputs: { ...baseRequest.inputs, title: "" } }, { signal: new AbortController().signal, getSecret: async () => "" });
  assert.equal(missingTitle.code, "INVALID_INPUT");

  const missingKey = await execute(baseRequest, { signal: new AbortController().signal, getSecret: async () => "" });
  assert.equal(missingKey.code, "OPENAI_API_KEY_REQUIRED");

  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const output = await mkdtemp(path.join(tmpdir(), "norte-thumbnail-test-"));
  try {
    const response = await execute(baseRequest, {
      signal: new AbortController().signal,
      getSecret: async () => "test-key",
      getOutputPath: (name) => path.join(output, name),
    });
  assert.equal(requestBody.model, "gpt-image-2");
    assert.equal(requestBody.size, "1536x864");
    assert.match(requestBody.prompt, /do not render any letters/i);
    assert.equal(response.code, "THUMBNAIL_MATERIALIZATION_FAILED");
  } finally {
    await rm(output, { recursive: true, force: true });
  }

  const simulationOutput = await mkdtemp(path.join(tmpdir(), "norte-thumbnail-simulation-"));
  try {
    const simulated = await execute({ ...baseRequest, configuration: { ...baseRequest.configuration, simulate: true } }, {
      signal: new AbortController().signal,
      getSecret: async () => "",
      getOutputPath: (name) => path.join(simulationOutput, name),
    });
    assert.equal(simulated.status, "success");
    assert.match(simulated.values.thumbnail_provenance, /nenhuma chamada OpenAI/i);
  } finally {
    await rm(simulationOutput, { recursive: true, force: true });
  }
  console.log("norte-magnata-thumbnail-studio: ok");
} finally {
  globalThis.fetch = originalFetch;
}
