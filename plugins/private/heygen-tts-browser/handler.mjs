import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { stat, writeFile } from "node:fs/promises";

const CAPABILITY_ID = "generate-browser-tts";
const DEFAULTS = Object.freeze({
  voiceId: "0d95c364a470438f9ec4952f84a7df72",
  rate: 1,
  pitch: 0,
  bridgePort: 10002,
});

class PluginFailure extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

function errorResponse(error) {
  return {
    status: "error",
    code: error?.code || "JOB_FAILED",
    message: error?.message || "A narração falhou sem produzir áudio.",
    retryable: Boolean(error?.retryable),
  };
}

function validateRequest(request) {
  if (request.capabilityId !== CAPABILITY_ID) {
    throw new PluginFailure("INVALID_INPUT", `Capacidade incompatível: ${request.capabilityId || "ausente"}.`);
  }
  const script = String(request.inputs?.script ?? "").trim();
  if (script.length < 10) throw new PluginFailure("INVALID_INPUT", "O roteiro aprovado está vazio ou curto demais.");
  if (script.length > 100_000) throw new PluginFailure("INVALID_INPUT", "O roteiro excede 100.000 caracteres.");

  const config = { ...DEFAULTS, ...(request.configuration || {}) };
  const allowed = new Set(Object.keys(DEFAULTS));
  const unknown = Object.keys(request.configuration || {}).find((key) => !allowed.has(key));
  if (unknown) throw new PluginFailure("INVALID_CONFIGURATION", `Parâmetro desconhecido: ${unknown}.`);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(String(config.voiceId))) {
    throw new PluginFailure("INVALID_CONFIGURATION", "O ID da voz HeyGen é inválido.");
  }
  if (!Number.isFinite(config.rate) || config.rate < 0.5 || config.rate > 2) {
    throw new PluginFailure("INVALID_CONFIGURATION", "A velocidade deve ficar entre 0,5 e 2.");
  }
  if (!Number.isFinite(config.pitch) || config.pitch < -50 || config.pitch > 50) {
    throw new PluginFailure("INVALID_CONFIGURATION", "O tom deve ficar entre -50 e 50.");
  }
  if (!Number.isInteger(config.bridgePort) || config.bridgePort < 1024 || config.bridgePort > 65535) {
    throw new PluginFailure("INVALID_CONFIGURATION", "A porta local da ponte é inválida.");
  }
  return { script, config };
}

function acceptKey(key) {
  return createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
}

function encodeFrame(text) {
  const payload = Buffer.from(text, "utf8");
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length]);
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  return Buffer.concat([header, payload]);
}

class FrameDecoder {
  constructor(onText) {
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.onText = onText;
  }

  push(chunk, socket) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = Boolean(first & 0x80);
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const wide = this.buffer.readBigUInt64BE(2);
        if (wide > BigInt(64 * 1024 * 1024)) throw new Error("Frame WebSocket excedeu 64 MB.");
        length = Number(wide);
        offset = 10;
      }
      const maskLength = masked ? 4 : 0;
      if (this.buffer.length < offset + maskLength + length) return;
      const mask = masked ? this.buffer.subarray(offset, offset + 4) : null;
      offset += maskLength;
      const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
      this.buffer = this.buffer.subarray(offset + length);
      if (mask) for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];

      if (opcode === 0x8) return socket.end();
      if (opcode === 0x9) {
        socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload]));
        continue;
      }
      if (opcode === 0x1 || opcode === 0x0) this.fragments.push(payload);
      if (fin && (opcode === 0x1 || opcode === 0x0)) {
        const message = Buffer.concat(this.fragments).toString("utf8");
        this.fragments = [];
        this.onText(message);
      }
    }
  }
}

async function openBridge(port, onMessage) {
  let client = null;
  const server = createServer((_request, response) => {
    response.writeHead(426);
    response.end();
  });
  server.on("upgrade", (request, socket) => {
    if (client) return socket.destroy();
    const key = request.headers["sec-websocket-key"];
    if (!key) return socket.destroy();
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`,
    );
    client = socket;
    const decoder = new FrameDecoder((text) => onMessage(JSON.parse(text)));
    socket.on("data", (chunk) => {
      try { decoder.push(chunk, socket); } catch (_error) { socket.destroy(); }
    });
    socket.on("close", () => { if (client === socket) client = null; });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    server,
    isConnected: () => Boolean(client && !client.destroyed),
    send: (value) => {
      if (!client || client.destroyed) throw new PluginFailure("UPSTREAM_UNAVAILABLE", "A extensão HeyGen não conectou à ponte local.", true);
      client.write(encodeFrame(JSON.stringify(value)));
    },
    close: async () => {
      if (client && !client.destroyed) client.end();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function waitFor(test, timeoutMs, message) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (test()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        reject(new PluginFailure("UPSTREAM_UNAVAILABLE", message, true));
      }
    }, 100);
  });
}

async function blockBytes(block) {
  if (Array.isArray(block.audioChunks) && block.audioChunks.length) {
    return Buffer.concat(block.audioChunks.map((chunk) => Buffer.from(chunk, "base64")));
  }
  if (typeof block.audioUrl === "string" && /^https:\/\/resource2\.heygen\.ai\//.test(block.audioUrl)) {
    const response = await fetch(block.audioUrl, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new PluginFailure("UPSTREAM_UNAVAILABLE", `Falha ao baixar bloco HeyGen (HTTP ${response.status}).`, true);
    return Buffer.from(await response.arrayBuffer());
  }
  throw new PluginFailure("JOB_FAILED", "O HeyGen concluiu um bloco sem áudio utilizável.");
}

function detectFormat(bytes, declared) {
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF") return { ext: "wav", mimeType: "audio/wav" };
  if (bytes.subarray(0, 4).toString("ascii") === "OggS") return { ext: "ogg", mimeType: "audio/ogg" };
  if (String(declared).toLowerCase() === "wav") return { ext: "wav", mimeType: "audio/wav" };
  if (String(declared).toLowerCase() === "ogg") return { ext: "ogg", mimeType: "audio/ogg" };
  return { ext: "mp3", mimeType: "audio/mpeg" };
}

function mergeWav(buffers) {
  const pcm = buffers.map((buffer) => buffer.subarray(44));
  const total = pcm.reduce((sum, item) => sum + item.length, 0);
  const output = Buffer.alloc(44 + total);
  buffers[0].copy(output, 0, 0, 44);
  output.writeUInt32LE(36 + total, 4);
  output.writeUInt32LE(total, 40);
  let offset = 44;
  for (const item of pcm) { item.copy(output, offset); offset += item.length; }
  return output;
}

function physicalOutputPath(services, name) {
  const logical = services.getOutputPath(name);
  return process.platform === "darwin" && logical.startsWith("/var/") ? `/private${logical}` : logical;
}

export async function execute(request, services) {
  let bridge;
  try {
    const { script, config } = validateRequest(request);
    const requestId = randomUUID();
    const jobId = request.executionId || randomUUID();
    const diagnosticAudio = String(request.settings?.diagnosticMockAudioBase64 || "");
    if (diagnosticAudio) {
      const audio = Buffer.from(diagnosticAudio, "base64");
      if (!audio.length) throw new PluginFailure("INVALID_CONFIGURATION", "O áudio diagnóstico é inválido.");
      const name = `narracao-${jobId}.mp3`;
      const outputPath = physicalOutputPath(services, name);
      await writeFile(outputPath, audio);
      const info = await stat(outputPath);
      const artifact = { id: "narration", name, mimeType: "audio/mpeg", size: info.size };
      return {
        status: "success",
        values: { narration: { ...artifact, url: "artifact://narration" } },
        artifacts: [{ ...artifact, source: { kind: "path", path: name } }],
        usage: { provider: "diagnostic", voiceId: config.voiceId, blocks: 1 },
      };
    }
    const blocks = new Map();
    let finalResponse = null;
    let extensionReady = false;

    bridge = await openBridge(config.bridgePort, (message) => {
      if (message?.type === "extension_ready") extensionReady = true;
      if (message?.type === "tts-block-ready" && message.jobId === jobId) blocks.set(message.blockIndex, message);
      if (message?.id === requestId) finalResponse = message;
    });

    await waitFor(() => extensionReady && bridge.isConnected(), 20_000, "Abra o HeyGen no Chrome e confirme que a extensão ContentFlow Bridge está ativa.");
    bridge.send({
      id: requestId,
      type: "generate-tts",
      texts: [script],
      voiceId: config.voiceId,
      jobId,
      rate: config.rate,
      pitch: config.pitch,
      voiceEngine: "auto",
    });

    await waitFor(() => finalResponse, 850_000, "O HeyGen não concluiu a narração dentro do tempo esperado.");
    if (finalResponse.status !== 200 || finalResponse.error || finalResponse.data?.success === false) {
      throw new PluginFailure("JOB_FAILED", finalResponse.error || finalResponse.data?.error || "O HeyGen recusou a geração.", false);
    }
    const totalBlocks = Number(finalResponse.data?.data?.totalBlocks ?? finalResponse.data?.totalBlocks ?? blocks.size);
    await waitFor(() => blocks.size >= totalBlocks, 60_000, "A geração terminou, mas nem todos os blocos de áudio chegaram ao ContentFlow.");

    const ordered = [...blocks.entries()].sort(([a], [b]) => a - b).map(([, value]) => value);
    const buffers = [];
    for (const block of ordered) buffers.push(await blockBytes(block));
    const format = detectFormat(buffers[0], ordered[0]?.format);
    const audio = format.ext === "wav" && buffers.length > 1 ? mergeWav(buffers) : Buffer.concat(buffers);
    const name = `narracao-${jobId}.${format.ext}`;
    const outputPath = physicalOutputPath(services, name);
    await writeFile(outputPath, audio);
    const info = await stat(outputPath);
    const artifact = { id: "narration", name, mimeType: format.mimeType, size: info.size };
    return {
      status: "success",
      values: { narration: { ...artifact, url: "artifact://narration" } },
      artifacts: [{ ...artifact, source: { kind: "path", path: name } }],
      usage: { provider: "HeyGen", voiceId: config.voiceId, blocks: ordered.length },
    };
  } catch (error) {
    return errorResponse(error);
  } finally {
    if (bridge) await bridge.close().catch(() => {});
  }
}
