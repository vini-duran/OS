import assert from "node:assert/strict";
import { PRESENTATION_RENDERER_IDS } from "../src/lib/domain";
import { copyImportedBlocks, parseMethodFile, serializeMethodFile } from "../src/lib/method-file";
import { normalizeMethodBlocks } from "../src/lib/human-workflow";
import {
  getCompatiblePresentationRenderers,
  getPresentationRestrictionIssue,
  normalizeFieldPresentation,
  resolvePresentationRenderer,
} from "../src/lib/presentation";

const legacyMethod = {
  format: "contentflow-method",
  version: 1,
  name: "Método legado",
  exportedAt: "2026-08-10T00:00:00.000Z",
  method: {
    processType: "assets",
    blocks: [
      {
        id: "block-1",
        type: "CRIAR",
        operator: "Humano",
        name: "Produzir assets",
        inputs: [{ id: "input-1", label: "Referências", type: "files", source: "previous_block" }],
        outputs: [
          {
            id: "output-1",
            label: "Assets",
            key: "assets",
            type: "files",
            required: true,
          },
        ],
        parameters: [],
        order: 0,
      },
    ],
  },
};

const parsedLegacy = parseMethodFile(JSON.stringify(legacyMethod));
assert.equal(parsedLegacy.method.blocks[0].inputs?.[0].presentation.renderer, "auto");
assert.equal(parsedLegacy.method.blocks[0].outputs?.[0].presentation.renderer, "auto");

const gallery = normalizeFieldPresentation("files", {
  renderer: "image-gallery",
  itemType: "image",
  acceptedMimeTypes: [" IMAGE/PNG ", "image/*", "image/*", "invalid"],
});
assert.deepEqual(gallery, {
  renderer: "image-gallery",
  itemType: "image",
  acceptedMimeTypes: ["image/png", "image/*"],
});
assert.equal(resolvePresentationRenderer("files", gallery), "image-gallery");
assert.equal(resolvePresentationRenderer("text", gallery), "text-short");
assert.equal(
  resolvePresentationRenderer("files", { renderer: "auto" }, [
    { id: "image", name: "image.png", mimeType: "image/png", size: 1, url: "local" },
  ]),
  "image-gallery",
);
assert.deepEqual(getCompatiblePresentationRenderers("records"), ["auto", "table", "cards"]);
assert.equal(new Set(PRESENTATION_RENDERER_IDS).size, PRESENTATION_RENDERER_IDS.length);
assert.equal(
  getPresentationRestrictionIssue(gallery, [
    { id: "audio", name: "audio.mp3", mimeType: "audio/mpeg", size: 1, url: "local" },
  ]),
  "deve conter apenas arquivos image",
);

const exported = serializeMethodFile("Método normalizado", parsedLegacy.method);
const reparsed = parseMethodFile(exported);
assert.equal(reparsed.method.blocks[0].outputs?.[0].presentation.renderer, "auto");

const pluginBinding = {
  pluginId: "official-openai-gpt",
  capabilityId: "generate-or-validate-text",
  configuration: { model: "gpt-5.2", temperature: 0.2, structured: true },
};
const pluginBoundMethod = {
  ...legacyMethod,
  name: "Método com plugin",
  method: {
    ...legacyMethod.method,
    blocks: [{ ...legacyMethod.method.blocks[0], plugin: pluginBinding }],
  },
};
const parsedPluginBoundMethod = parseMethodFile(JSON.stringify(pluginBoundMethod));
assert.deepEqual(parsedPluginBoundMethod.method.blocks[0].plugin, pluginBinding);
assert.throws(
  () =>
    parseMethodFile(
      JSON.stringify({
        ...pluginBoundMethod,
        method: {
          ...pluginBoundMethod.method,
          blocks: [{ ...pluginBoundMethod.method.blocks[0], plugin: { pluginId: "invalid" } }],
        },
      }),
    ),
  /arquivo de método válido/,
);
for (const plugin of [
  { ...pluginBinding, pluginId: " \t " },
  { ...pluginBinding, capabilityId: "\n" },
  { ...pluginBinding, unexpected: true },
]) {
  assert.throws(
    () =>
      parseMethodFile(
        JSON.stringify({
          ...pluginBoundMethod,
          method: {
            ...pluginBoundMethod.method,
            blocks: [{ ...pluginBoundMethod.method.blocks[0], plugin }],
          },
        }),
      ),
    /arquivo de método válido/,
  );
}

const exportedPluginBoundMethod = serializeMethodFile(
  "Método com plugin",
  parsedPluginBoundMethod.method,
);
assert.deepEqual(parseMethodFile(exportedPluginBoundMethod).method.blocks[0].plugin, pluginBinding);

const seededBlocks = normalizeMethodBlocks(
  copyImportedBlocks("assets", parsedPluginBoundMethod.method.blocks, (prefix) => `${prefix}-copy`),
  "assets",
);
assert.deepEqual(seededBlocks[0].plugin, pluginBinding);

console.log("Presentation contract smoke test passed.");
