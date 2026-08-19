import { readFile, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const OPENAI_API = "https://api.openai.com/v1";
const IMAGE_MODEL = "gpt-image-2";
const WIDTH = 1536;
const HEIGHT = 864;
const TEST_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Jxd0AAAAASUVORK5CYII=";

function string(value) {
  return typeof value === "string" ? value.trim() : "";
}

function missing(message) {
  return { status: "error", code: "INVALID_INPUT", message, retryable: false };
}

function apiError(status, body, fallback) {
  return {
    status: "error",
    code: `OPENAI_HTTP_${status}`,
    message: string(body?.error?.message) || fallback,
    retryable: status === 429 || status >= 500,
  };
}

async function getKey(services) {
  return string(await services.getSecret("OPENAI_API_KEY"));
}

async function postJson(path, key, payload, signal) {
  const response = await fetch(`${OPENAI_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  return { response, body: await response.json().catch(() => ({})) };
}

function thumbnailPrompt({ title, theme, direction }) {
  return [
    "Create a single cinematic YouTube thumbnail background in a strict 16:9 composition.",
    "Audience and language are Brazilian Portuguese, but do not render any letters, words, numbers, logos, watermark, UI, chart, caption, or branding inside the image.",
    `Video title context: ${title}`,
    `Editorial theme: ${theme}`,
    `Visual direction: ${direction}`,
    "Show one unmistakable visual tension or decision related to the theme, with a clear primary subject and an action that can be understood at thumbnail size.",
    "Reserve clean negative space on the left third for a later headline overlay, without making it blank white or a panel. Keep the subject on the right two-thirds.",
    "Use rich dark-to-warm contrast, realistic cinematic photography, intentional lighting, depth, and a complete edge-to-edge scene.",
    "Do not create a collage, split screen, framed card, border, poster, or white/gray side margins. No tiny details or decorative stock imagery.",
  ].join("\n");
}

function imageBytes(body) {
  const encoded = body?.data?.[0]?.b64_json;
  if (typeof encoded !== "string" || !encoded.trim()) return undefined;
  try {
    return Buffer.from(encoded, "base64");
  } catch {
    return undefined;
  }
}

async function generateImage({ key, prompt, quality, signal }) {
  const preferred = {
    model: IMAGE_MODEL,
    prompt,
    size: `${WIDTH}x${HEIGHT}`,
    quality,
    output_format: "png",
  };
  let result = await postJson("/images/generations", key, preferred, signal);
  if (result.response.ok) return { ...result, usedFallbackSize: false };

  const message = string(result.body?.error?.message).toLowerCase();
  if (!/size|dimension|aspect/.test(message)) return { ...result, usedFallbackSize: false };

  result = await postJson(
    "/images/generations",
    key,
    { ...preferred, size: "1536x1024" },
    signal,
  );
  return { ...result, usedFallbackSize: true };
}

async function inspectFinal(finalPath) {
  const dimensions = await execFile("/usr/bin/sips", ["-g", "pixelWidth", "-g", "pixelHeight", finalPath]);
  const width = Number.parseInt(String(dimensions.stdout).match(/pixelWidth:\s*(\d+)/)?.[1] ?? "", 10);
  const height = Number.parseInt(String(dimensions.stdout).match(/pixelHeight:\s*(\d+)/)?.[1] ?? "", 10);
  if (width !== WIDTH || height !== HEIGHT) {
    throw new Error(`A thumbnail final não tem 16:9 válido (${width || "?"}x${height || "?"}).`);
  }
  const { stdout } = await execFile("/usr/bin/stat", ["-f", "%z", finalPath]);
  const size = Number.parseInt(String(stdout).trim(), 10);
  if (!Number.isSafeInteger(size) || size < 1) throw new Error("A thumbnail final não possui bytes válidos.");
  return size;
}

async function cropTo16x9(sourcePath, finalPath, needsCrop) {
  if (needsCrop) {
    await execFile("/usr/bin/sips", ["-c", String(HEIGHT), String(WIDTH), sourcePath, "--out", finalPath]);
  } else {
    await execFile("/bin/cp", [sourcePath, finalPath]);
  }
  return inspectFinal(finalPath);
}

function generatedValues(finalName, finalSize, provenance) {
  return {
    thumbnail: { id: "thumbnail-16x9", name: finalName, mimeType: "image/png", size: finalSize, url: "artifact://thumbnail-16x9" },
    thumbnail_provenance: provenance,
  };
}

function generatedArtifact(finalName, finalSize) {
  return [{ id: "thumbnail-16x9", name: finalName, mimeType: "image/png", size: finalSize, source: { kind: "path", path: finalName } }];
}

function outputText(body) {
  if (string(body?.output_text)) return string(body.output_text);
  return (Array.isArray(body?.output) ? body.output : [])
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .filter((item) => item?.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function parseJson(text) {
  try {
    return JSON.parse(text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    return undefined;
  }
}

async function runGenerate(request, services) {
  const title = string(request.inputs?.title);
  const theme = string(request.inputs?.theme);
  if (!title) return missing("O bloco de thumbnail precisa receber o título aprovado.");
  if (!theme) return missing("O bloco de thumbnail precisa receber o dossiê de tema.");
  const sourceName = "thumbnail-source.png";
  const finalName = "thumbnail-16x9.png";
  if (request.configuration?.simulate === true) {
    try {
      await writeFile(services.getOutputPath(sourceName), Buffer.from(TEST_PIXEL_PNG, "base64"));
      const finalPath = services.getOutputPath(finalName);
      await execFile("/usr/bin/sips", ["-z", String(HEIGHT), String(WIDTH), services.getOutputPath(sourceName), "--out", finalPath]);
      const finalSize = await inspectFinal(finalPath);
      return {
        status: "success",
        values: generatedValues(finalName, finalSize, `Simulação técnica: PNG neutro ${WIDTH}x${HEIGHT}px (16:9) materializado; nenhuma chamada OpenAI foi feita.`),
        artifacts: generatedArtifact(finalName, finalSize),
        logs: ["simulation=true", "openai_image_calls=0"],
      };
    } catch (error) {
      return { status: "error", code: "THUMBNAIL_MATERIALIZATION_FAILED", message: error instanceof Error ? error.message : "Não foi possível materializar a thumbnail simulada.", retryable: false };
    }
  }
  const key = await getKey(services);
  if (!key) return { status: "error", code: "OPENAI_API_KEY_REQUIRED", message: "Conecte OPENAI_API_KEY a este plugin na Central de Plugins.", retryable: false };

  const quality = request.configuration?.quality === "medium" ? "medium" : "high";
  const direction = string(request.configuration?.visual_direction) || "Filosofia prática, tensão humana, fotografia cinematográfica sóbria.";
  let generated;
  try {
    generated = await generateImage({ key, prompt: thumbnailPrompt({ title, theme, direction }), quality, signal: services.signal });
  } catch (error) {
    return { status: "error", code: "OPENAI_UNAVAILABLE", message: error instanceof Error ? error.message : "A geração de imagem não respondeu.", retryable: true };
  }
  if (!generated.response.ok) return apiError(generated.response.status, generated.body, "A OpenAI não gerou a thumbnail.");
  const bytes = imageBytes(generated.body);
  if (!bytes?.length) return { status: "error", code: "OPENAI_IMAGE_EMPTY", message: "A OpenAI não devolveu bytes PNG para a thumbnail.", retryable: true };

  try {
    await writeFile(services.getOutputPath(sourceName), bytes);
    const finalSize = await cropTo16x9(
      services.getOutputPath(sourceName),
      services.getOutputPath(finalName),
      generated.usedFallbackSize,
    );
    return {
      status: "success",
      values: generatedValues(finalName, finalSize, `Gerada por ${IMAGE_MODEL} em qualidade ${quality}; composição final ${WIDTH}x${HEIGHT}px (16:9)${generated.usedFallbackSize ? "; a fonte 3:2 foi recortada no centro antes da entrega" : "; entregue no tamanho 16:9 solicitado"}. Sem texto embutido; o título será aplicado somente na camada editorial posterior.`),
      artifacts: generatedArtifact(finalName, finalSize),
      usage: { provider: "OpenAI Images API", model: IMAGE_MODEL, unit: "images", inputUnits: 1, outputUnits: 1, totalUnits: 1 },
    };
  } catch (error) {
    return { status: "error", code: "THUMBNAIL_MATERIALIZATION_FAILED", message: error instanceof Error ? error.message : "Não foi possível materializar a thumbnail 16:9.", retryable: true };
  }
}

async function runValidate(request, services) {
  const title = string(request.inputs?.title);
  const theme = string(request.inputs?.theme);
  const thumbnail = request.inputs?.thumbnail;
  const key = await getKey(services);
  if (!title || !theme) return missing("A validação exige título e dossiê de tema.");
  if (!thumbnail || typeof thumbnail !== "object") return missing("A validação exige a imagem de thumbnail materializada.");
  if (!key) return { status: "error", code: "OPENAI_API_KEY_REQUIRED", message: "Conecte OPENAI_API_KEY a este plugin na Central de Plugins.", retryable: false };

  let image;
  try {
    const path = await services.resolveInputFile(thumbnail);
    image = await readFile(path);
  } catch (error) {
    return { status: "error", code: "THUMBNAIL_READ_FAILED", message: error instanceof Error ? error.message : "Não foi possível ler a thumbnail para revisão.", retryable: false };
  }
  const mimeType = string(thumbnail.mimeType) || "image/png";
  const model = string(request.configuration?.model) || "gpt-5.6-terra";
  const prompt = [
    "Você é o revisor visual do canal Norte Magnata. Avalie a thumbnail enviada, não gere uma nova.",
    `Título: ${title}`,
    `Tema: ${theme}`,
    "Reprove se houver margem lateral branca/cinza, painel uniforme sem textura narrativa, borda, proporção aparente diferente de 16:9, assunto sem foco, imagem genérica ou decorativa, colagem, texto ilegível/aleatório, visual que contradiz o título, ou ausência de tensão visual clara. Uma área escura texturizada e coerente, reservada para a headline posterior, é permitida e não deve ser confundida com painel vazio.",
    "A ausência de texto na imagem é correta: texto será composto depois. Não reprove por isso.",
    'Responda somente JSON válido: {"decision":"approved"|"rejected","thumbnail_review":"explicação curta e concreta"}.',
  ].join("\n");
  let result;
  try {
    result = await postJson("/responses", key, {
      model,
      store: false,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: `data:${mimeType};base64,${image.toString("base64")}` }] }],
    }, services.signal);
  } catch (error) {
    return { status: "error", code: "OPENAI_UNAVAILABLE", message: error instanceof Error ? error.message : "A revisão visual não respondeu.", retryable: true };
  }
  if (!result.response.ok) return apiError(result.response.status, result.body, "A OpenAI não revisou a thumbnail.");
  const parsed = parseJson(outputText(result.body));
  if (!parsed || !["approved", "rejected"].includes(parsed.decision)) {
    return { status: "error", code: "THUMBNAIL_REVIEW_FORMAT", message: "A revisão visual não devolveu uma decisão válida.", retryable: true };
  }
  return {
    status: "success",
    values: { decision: parsed.decision, thumbnail_review: string(parsed.thumbnail_review) || "Revisão visual concluída sem observação adicional." },
    usage: { provider: "OpenAI Responses API", model: result.body?.model || model, unit: "tokens", inputUnits: result.body?.usage?.input_tokens, outputUnits: result.body?.usage?.output_tokens, totalUnits: result.body?.usage?.total_tokens },
  };
}

export async function execute(request, services) {
  if (request.invocation?.mode !== "start") return { status: "error", code: "INVALID_INVOCATION", message: "Esta capacidade é imediata e não possui job assíncrono.", retryable: false };
  if (services.signal?.aborted) return { status: "error", code: "CANCELLED", message: "Execução cancelada.", retryable: false };
  if (request.capabilityId === "generate-16x9-thumbnail") return runGenerate(request, services);
  if (request.capabilityId === "validate-thumbnail-vision") return runValidate(request, services);
  return { status: "error", code: "UNKNOWN_CAPABILITY", message: "Capacidade de thumbnail não reconhecida.", retryable: false };
}
