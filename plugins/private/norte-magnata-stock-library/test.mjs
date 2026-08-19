import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execute } from "./handler.mjs";

const temp = await mkdtemp(path.join(os.tmpdir(), "norte-stock-"));
try {
  const assets = [
    { id_cena: "B01_C01", midia_principal: "broll_video", broll_consulta: "focused work", broll_funcao: "evidência", overlay: "nenhum", sfx: "nenhum" },
    { id_cena: "B01_C02", midia_principal: "imagem_animada", overlay: "poeira_sutil", sfx: "nenhum" },
    { id_cena: "B01_C03", midia_principal: "imagem_animada", overlay: "nenhum", sfx: "whoosh_curto" }
  ];
  const services = { signal: AbortSignal.timeout(5000), getSecret: async () => "", getOutputPath: (name) => path.join(temp, name) };
  const created = await execute({ invocation: { mode: "start" }, capabilityId: "materialize-stock-assets", configuration: { simulate: true }, inputs: { assets } }, services);
  assert.equal(created.status, "success");
  assert.equal(created.values.stock_assets.length, 3);
  const stored = created.values.stock_assets.map((item, index) => ({ ...item, file: { ...item.file, url: `/api/files/${index}`, sha256: "a".repeat(64), size: item.kind === "sfx" ? 2000 : 60000 } }));
  const validated = await execute({ invocation: { mode: "start" }, capabilityId: "validate-stock-assets", inputs: { stock_assets: stored } }, services);
  assert.equal(validated.status, "success");
  assert.equal(validated.values.decision, "approved");
  const rejected = await execute({ invocation: { mode: "start" }, capabilityId: "validate-stock-assets", inputs: { stock_assets: [{ ...stored[0], file: { ...stored[0].file, sha256: "ausente" } }] } }, services);
  assert.equal(rejected.status, "error");
  assert.equal(rejected.code, "STOCK_QA_FAILED");
  console.log("norte-magnata-stock-library: ok");
} finally { await rm(temp, { recursive: true, force: true }); }
