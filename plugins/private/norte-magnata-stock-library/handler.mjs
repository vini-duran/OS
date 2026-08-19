import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const NONE = new Set(["", "nenhum", "none", "—", "-"]);
const ALLOWED_LICENSES = new Set(["cc0", "pdm", "by", "by-sa", "pixabay"]);
const text = (value) => typeof value === "string" ? value.trim() : "";
const cleanWrapper = (value) => text(value).replace(/^[\[({<]+/, "").replace(/[\])}>]+$/, "");
const fail = (code, message, retryable = false) => ({ status: "error", code, message, retryable });
const placeholder = (id, name, mimeType, size) => ({ id, name, mimeType, size, url: `artifact://${id}` });
const localArtifact = (id, name, mimeType, size) => ({ id, name, mimeType, size, source: { kind: "path", path: name } });
const remoteArtifact = (id, name, mimeType, size, url) => ({ id, name, mimeType, size, source: { kind: "url", url } });

function keyPool(value) {
  return text(value).replace(/^['"]|['"]$/g, "").split(/[;,\n]+/).map(cleanWrapper).filter(Boolean);
}

function clients(value) {
  try {
    const parsed = JSON.parse(text(value));
    return Array.isArray(parsed) ? parsed.map((item) => ({ id: cleanWrapper(item.id), secret: cleanWrapper(item.secret) })).filter((item) => item.id && item.secret) : [];
  } catch { return []; }
}

async function fetchJson(url, options = {}, timeout = 12000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.any([options.signal || new AbortController().signal, AbortSignal.timeout(timeout)]) });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function withKeyPool(keys, request) {
  let last;
  for (let index = 0; index < keys.length; index += 1) {
    try {
      const result = await request(keys[index]);
      if (result.response.ok) return result;
      last = new Error(text(result.body?.error) || text(result.body?.message) || `HTTP ${result.response.status}`);
      if (![401, 403, 429].includes(result.response.status)) break;
    } catch (error) { last = error; break; }
  }
  throw last || new Error("Nenhuma chave válida respondeu.");
}

function videoChoice(videos) {
  const choices = Object.values(videos || {}).filter((item) => item && typeof item === "object" && /^https:\/\//.test(text(item.url)) && Number(item.width) / Math.max(1, Number(item.height)) > 1.55);
  choices.sort((left, right) => {
    const leftFit = Number(left.width) <= 1920 ? Number(left.width) : 0;
    const rightFit = Number(right.width) <= 1920 ? Number(right.width) : 0;
    return rightFit - leftFit || Number(left.size || Infinity) - Number(right.size || Infinity);
  });
  return choices[0];
}

async function searchPixabay(query, keys, usedIds) {
  const encoded = encodeURIComponent(query.slice(0, 100));
  const { body } = await withKeyPool(keys, (key) => fetchJson(`https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${encoded}&per_page=20&safesearch=true`));
  for (const item of body.hits || []) {
    const id = String(item.id || "");
    const variant = videoChoice(item.videos);
    if (!id || usedIds.has(`pixabay:${id}`) || !variant) continue;
    usedIds.add(`pixabay:${id}`);
    return {
      provider: "Pixabay", remoteId: id, title: text(item.tags) || `Pixabay ${id}`, author: text(item.user), sourceUrl: text(item.pageURL), downloadUrl: text(variant.url), license: "pixabay", licenseUrl: "https://pixabay.com/service/license-summary/", width: Number(variant.width), height: Number(variant.height), duration: Number(item.duration), size: Number(variant.size || 0), mimeType: "video/mp4"
    };
  }
  throw new Error(`Pixabay sem vídeo utilizável para: ${query}`);
}

async function searchPexels(query, keys, usedIds) {
  const encoded = encodeURIComponent(query.slice(0, 100));
  const { body } = await withKeyPool(keys, (key) => fetchJson(`https://api.pexels.com/videos/search?query=${encoded}&per_page=20&orientation=landscape`, { headers: { Authorization: key } }, 8000));
  for (const item of body.videos || []) {
    const id = String(item.id || "");
    const choices = (item.video_files || []).filter((file) => text(file.link).startsWith("https://") && Number(file.width) / Math.max(1, Number(file.height)) > 1.55).sort((left, right) => Math.abs(Number(left.width) - 1920) - Math.abs(Number(right.width) - 1920));
    const variant = choices[0];
    if (!id || usedIds.has(`pexels:${id}`) || !variant) continue;
    usedIds.add(`pexels:${id}`);
    return { provider: "Pexels", remoteId: id, title: `Pexels ${id}`, author: text(item.user?.name), sourceUrl: text(item.url), downloadUrl: text(variant.link), license: "pexels", licenseUrl: "https://www.pexels.com/license/", width: Number(variant.width), height: Number(variant.height), duration: Number(item.duration), size: undefined, mimeType: "video/mp4" };
  }
  throw new Error(`Pexels sem vídeo utilizável para: ${query}`);
}

async function searchVideo(query, secrets, order, usedIds) {
  const sources = order === "pexels_first" ? ["pexels", "pixabay"] : ["pixabay", "pexels"];
  let last;
  for (const source of sources) {
    try {
      if (source === "pixabay" && secrets.pixabay.length) return await searchPixabay(query, secrets.pixabay, usedIds);
      if (source === "pexels" && secrets.pexels.length) return await searchPexels(query, secrets.pexels, usedIds);
    } catch (error) { last = error; }
  }
  throw last || new Error("Nenhum provedor de vídeo foi configurado.");
}

async function openverseToken(pool) {
  let last;
  for (const client of pool) {
    try {
      const form = new URLSearchParams({ client_id: client.id, client_secret: client.secret, grant_type: "client_credentials" });
      const { response, body } = await fetchJson("https://api.openverse.org/v1/auth_tokens/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
      if (response.ok && body.access_token) return body.access_token;
      last = new Error(text(body?.detail) || `Openverse HTTP ${response.status}`);
      if (![400, 401, 403, 429].includes(response.status)) break;
    } catch (error) { last = error; break; }
  }
  throw last || new Error("Nenhum cliente Openverse válido respondeu.");
}

function sfxQuery(value) {
  const normalized = text(value).toLowerCase();
  if (normalized.includes("tick") || normalized.includes("relóg")) return "clock tick";
  if (normalized.includes("impact") || normalized.includes("hit")) return "cinematic impact";
  if (normalized.includes("reverse")) return "reverse whoosh";
  if (normalized.includes("glitch")) return "digital glitch";
  return "whoosh";
}

async function searchOpenverseAudio(query, token, usedIds) {
  const url = `https://api.openverse.org/v1/audio/?q=${encodeURIComponent(query)}&license=cc0,pdm,by,by-sa&page_size=20`;
  const { response, body } = await fetchJson(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(text(body?.detail) || `Openverse HTTP ${response.status}`);
  for (const item of body.results || []) {
    const id = text(item.id), downloadUrl = text(item.url), sourceUrl = text(item.foreign_landing_url), license = text(item.license).toLowerCase(), filetype = text(item.filetype).toLowerCase();
    let host = "";
    try { host = new URL(downloadUrl).hostname; } catch { continue; }
    if (!id || usedIds.has(`openverse:${id}`) || !["mp3", "wav", "ogg"].includes(filetype) || !ALLOWED_LICENSES.has(license) || host !== "cdn.freesound.org") continue;
    const durationMs = Number(item.duration || 0);
    if (durationMs > 15000 || Number(item.filesize || 0) > 20_000_000) continue;
    usedIds.add(`openverse:${id}`);
    return { provider: "Openverse", remoteId: id, title: text(item.title) || query, author: text(item.creator), sourceUrl, downloadUrl, license, licenseUrl: text(item.license_url), duration: durationMs / 1000, size: Number(item.filesize || 0) || undefined, mimeType: filetype === "wav" ? "audio/wav" : filetype === "ogg" ? "audio/ogg" : "audio/mpeg", extension: filetype };
  }
  throw new Error(`Openverse sem SFX utilizável para: ${query}`);
}

function safe(value) { return text(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "asset"; }

function assignment(scene, kind, role, query, media, artifactId) {
  const extension = media.extension || "mp4";
  const name = `${safe(kind)}-${safe(scene.id_cena)}-${safe(media.remoteId)}.${extension}`;
  return {
    id: `${kind}:${scene.id_cena}`,
    production_id: scene.production_id,
    scene_id: scene.id_cena,
    kind,
    editorial_role: role,
    query,
    provider: media.provider,
    provider_id: media.remoteId,
    title: media.title,
    author: media.author,
    license: media.license,
    license_url: media.licenseUrl,
    source_url: media.sourceUrl,
    width: media.width || 0,
    height: media.height || 0,
    duration: media.duration || 0,
    file: placeholder(artifactId, name, media.mimeType, media.size)
  };
}

async function materialize(request, services) {
  const assets = Array.isArray(request.inputs?.assets) ? request.inputs.assets : [];
  if (!assets.length) return fail("ASSET_MAP_REQUIRED", "O mapa de cenas aprovado é obrigatório.");
  const hash = createHash("sha256").update(JSON.stringify(assets)).digest("hex");
  const productionId = `NM-CF-${hash.slice(0, 16).toUpperCase()}`;
  const scenes = assets.map((scene) => ({ ...scene, production_id: productionId }));
  const simulated = request.configuration?.simulate === true;
  const artifacts = [], records = [], mediaByKey = new Map(), usedIds = new Set();
  if (simulated) {
    const targets = [scenes.find((scene) => scene.midia_principal === "broll_video"), scenes.find((scene) => !NONE.has(text(scene.overlay).toLowerCase())), scenes.find((scene) => !NONE.has(text(scene.sfx).toLowerCase()))].filter(Boolean);
    for (const [index, scene] of targets.entries()) {
      const audio = index === 2, id = `fixture-${index + 1}`, name = audio ? `${id}.mp3` : `${id}.mp4`, mime = audio ? "audio/mpeg" : "video/mp4";
      await writeFile(services.getOutputPath(name), Buffer.from([index + 1]));
      const media = { provider: index === 2 ? "Openverse" : "Pixabay", remoteId: id, title: id, author: "fixture", sourceUrl: "https://example.test/item", license: index === 2 ? "cc0" : "pixabay", licenseUrl: "https://example.test/license", width: audio ? 0 : 1920, height: audio ? 0 : 1080, duration: 2, size: 1, mimeType: mime, extension: audio ? "mp3" : "mp4" };
      records.push(assignment(scene, index === 0 ? "broll" : index === 1 ? "overlay" : "sfx", "fixture", "fixture", media, id));
      artifacts.push(localArtifact(id, name, mime, 1));
    }
    return { status: "success", values: { stock_assets: records, stock_report: `Simulação: ${records.length} assignments.` }, artifacts };
  }
  const secrets = {
    pexels: keyPool(await services.getSecret("PEXELS_API_KEYS")),
    pixabay: keyPool(await services.getSecret("PIXABAY_API_KEYS")),
    openverse: clients(await services.getSecret("OPENVERSE_CLIENTS_JSON"))
  };
  if (!secrets.pixabay.length && !secrets.pexels.length) return fail("VIDEO_KEYS_REQUIRED", "Conecte chaves Pixabay ou Pexels.");
  if (!secrets.openverse.length) return fail("OPENVERSE_KEYS_REQUIRED", "Conecte os clientes Openverse.");
  try {
    for (const scene of scenes.filter((item) => item.midia_principal === "broll_video")) {
      const query = text(scene.broll_consulta) || "focused person taking action";
      const media = await searchVideo(query, secrets, request.configuration?.video_provider_order || "pixabay_first", usedIds);
      const id = `broll-${safe(scene.id_cena)}-${safe(media.remoteId)}`;
      records.push(assignment(scene, "broll", text(scene.broll_funcao), query, media, id));
      artifacts.push(remoteArtifact(id, records.at(-1).file.name, media.mimeType, media.size, media.downloadUrl));
    }
    const overlayScenes = scenes.filter((scene) => !NONE.has(text(scene.overlay).toLowerCase()));
    const uniqueOverlayCount = Math.min(Number(request.configuration?.overlay_unique_assets || 6), overlayScenes.length);
    for (let index = 0; index < uniqueOverlayCount; index += 1) {
      const type = text(overlayScenes[index % overlayScenes.length]?.overlay) || "dust particles";
      const query = `${type.replaceAll("_", " ")} dark background cinematic overlay`;
      const media = await searchVideo(query, secrets, request.configuration?.video_provider_order || "pixabay_first", usedIds);
      const id = `overlay-${index + 1}-${safe(media.remoteId)}`;
      mediaByKey.set(`overlay:${index}`, { media, id, query });
      artifacts.push(remoteArtifact(id, `overlay-${index + 1}-${safe(media.remoteId)}.mp4`, media.mimeType, media.size, media.downloadUrl));
    }
    overlayScenes.forEach((scene, index) => {
      const item = mediaByKey.get(`overlay:${index % uniqueOverlayCount}`);
      records.push(assignment(scene, "overlay", `atmosfera ${text(scene.overlay)}`, item.query, item.media, item.id));
    });
    const sfxScenes = scenes.filter((scene) => !NONE.has(text(scene.sfx).toLowerCase()));
    const uniqueSfxCount = Math.min(Number(request.configuration?.sfx_unique_assets || 8), sfxScenes.length);
    const token = await openverseToken(secrets.openverse);
    for (let index = 0; index < uniqueSfxCount; index += 1) {
      const query = sfxQuery(sfxScenes[index % sfxScenes.length]?.sfx);
      const media = await searchOpenverseAudio(query, token, usedIds);
      const id = `sfx-${index + 1}-${safe(media.remoteId)}`;
      mediaByKey.set(`sfx:${index}`, { media, id, query });
      artifacts.push(remoteArtifact(id, `sfx-${index + 1}-${safe(media.remoteId)}.${media.extension}`, media.mimeType, media.size, media.downloadUrl));
    }
    sfxScenes.forEach((scene, index) => {
      const item = mediaByKey.get(`sfx:${index % uniqueSfxCount}`);
      records.push(assignment(scene, "sfx", `pontuação ${text(scene.sfx)}`, item.query, item.media, item.id));
    });
  } catch (error) { return fail("STOCK_SEARCH_FAILED", error instanceof Error ? error.message : "Falha na busca stock.", true); }
  const counts = { broll: records.filter((item) => item.kind === "broll").length, overlayAssignments: records.filter((item) => item.kind === "overlay").length, sfxAssignments: records.filter((item) => item.kind === "sfx").length, uniqueFiles: artifacts.length };
  return { status: "success", values: { stock_assets: records, stock_report: `${counts.broll} B-rolls; ${counts.overlayAssignments} overlays (${uniqueOverlayCount} arquivos); ${counts.sfxAssignments} SFX (${uniqueSfxCount} arquivos); ${counts.uniqueFiles} downloads com licença registrada.` }, artifacts };
}

async function validateStock(request, services) {
  const records = Array.isArray(request.inputs?.stock_assets) ? request.inputs.stock_assets : [];
  const problems = [];
  for (const item of records) {
    const file = item?.file && typeof item.file === "object" ? item.file : {};
    if (!text(item.production_id) || !text(item.scene_id) || !["broll", "overlay", "sfx"].includes(item.kind)) problems.push(`${item?.id || "item"}: identidade incompleta.`);
    if (!text(item.provider) || !text(item.source_url) || !text(item.license_url) || !text(item.author)) problems.push(`${item?.id || "item"}: proveniência incompleta.`);
    if (!ALLOWED_LICENSES.has(text(item.license).toLowerCase()) && text(item.license).toLowerCase() !== "pexels") problems.push(`${item?.id || "item"}: licença não permitida.`);
    if (!/^[a-f0-9]{64}$/i.test(text(file.sha256))) problems.push(`${item?.id || "item"}: hash ausente.`);
    if (!(Number(file.size) > (item.kind === "sfx" ? 1000 : 50000))) problems.push(`${item?.id || "item"}: arquivo pequeno ou vazio.`);
    if (item.kind === "sfx" ? !text(file.mimeType).startsWith("audio/") : !text(file.mimeType).startsWith("video/")) problems.push(`${item?.id || "item"}: MIME incompatível.`);
  }
  const productionIds = new Set(records.map((item) => item.production_id));
  if (productionIds.size !== 1) problems.push("production_id divergente entre assets stock.");
  const counts = { assignments: records.length, unique_files: new Set(records.map((item) => item.file?.sha256)).size, broll: records.filter((item) => item.kind === "broll").length, overlays: records.filter((item) => item.kind === "overlay").length, sfx: records.filter((item) => item.kind === "sfx").length };
  const manifest = { version: "norte_magnata_stock_v1", created_at: new Date().toISOString(), production_id: [...productionIds][0] || "", counts, items: records };
  const content = `${JSON.stringify(manifest, null, 2)}\n`, name = "manifesto-stock-validado.json", size = Buffer.byteLength(content);
  await writeFile(services.getOutputPath(name), content, "utf8");
  return { status: "success", values: { decision: problems.length ? "rejected" : "approved", validated_stock_assets: records, stock_manifest: placeholder("stock-manifest", name, "application/json", size), stock_validation_report: problems.length ? `REPROVADO. ${[...new Set(problems)].slice(0, 30).join(" | ")}` : `APROVADO. ${counts.assignments} usos, ${counts.unique_files} arquivos únicos, todos com licença, origem e SHA-256.` }, artifacts: [localArtifact("stock-manifest", name, "application/json", size)] };
}

export async function execute(request, services) {
  if (request.invocation?.mode !== "start") return fail("INVALID_INVOCATION", "Capacidade imediata.");
  if (request.capabilityId === "materialize-stock-assets") return materialize(request, services);
  if (request.capabilityId === "validate-stock-assets") return validateStock(request, services);
  return fail("CAPABILITY_NOT_FOUND", "Capacidade desconhecida.");
}
