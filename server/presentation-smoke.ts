import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageGallery } from "../src/components/image-gallery";
import { PRESENTATION_RENDERER_IDS } from "../src/lib/domain";
import { parseMethodFile, serializeMethodFile } from "../src/lib/method-file";
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
assert.equal(parsedLegacy.method.blocks[0].inputs?.[0].presentation?.renderer, "auto");
assert.equal(parsedLegacy.method.blocks[0].outputs?.[0].presentation?.renderer, "auto");

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
assert.equal(reparsed.method.blocks[0].outputs?.[0].presentation?.renderer, "auto");

const processRunnerSource = readFileSync(
  new URL("../src/components/process-runner.tsx", import.meta.url),
  "utf8",
);
const executionResultsSource = processRunnerSource.slice(
  processRunnerSource.indexOf("function ExecutionResults"),
  processRunnerSource.indexOf("function ResultValue"),
);
assert.match(executionResultsSource, /item\.status === "cancelled"/);
assert.match(executionResultsSource, /open=\{blockExecution\.status !== "completed"\}/);
assert.match(processRunnerSource, /w-full max-w-6xl border-t/);

const rendererSource = readFileSync(
  new URL("../src/components/runtime-value-renderers.tsx", import.meta.url),
  "utf8",
);
const imageGallerySource = rendererSource.slice(
  rendererSource.indexOf("function ImageGalleryRenderer"),
  rendererSource.indexOf("function AudioRenderer"),
);
// O layout de 4 colunas em grid do autor original foi rejeitado em favor da galeria/zoom/teclado do fork.
assert.doesNotMatch(imageGallerySource, /lg:grid-cols-4/);
assert.match(imageGallerySource, /<ImageGallery\s+images=\{images\}\s+compact=\{compact\}\s*\/>/);

// Contrato real do fork: galeria integrada, modal de zoom, trilho horizontal e navegação por teclado
const testImages = [
  { id: "img-1", name: "imagem-1.png", mimeType: "image/png", size: 100, url: "/img-1.png" },
  { id: "img-2", name: "imagem-2.png", mimeType: "image/png", size: 200, url: "/img-2.png" },
];
const galleryMarkup = renderToStaticMarkup(
  createElement(ImageGallery, {
    images: testImages,
    compact: false,
  }),
);
assert.match(galleryMarkup, /Ampliar imagem 1/);
assert.match(galleryMarkup, /overflow-x-auto/);

const gallerySource = readFileSync(
  new URL("../src/components/image-gallery.tsx", import.meta.url),
  "utf8",
);
assert.match(gallerySource, /export function ImageGallery/);
assert.match(gallerySource, /ArrowLeft/);
assert.match(gallerySource, /ArrowRight/);
assert.match(gallerySource, /Esc para fechar/);

const galleryTestSource = readFileSync(
  new URL("../src/components/image-gallery.test.tsx", import.meta.url),
  "utf8",
);
assert.match(galleryTestSource, /all 30 images have previews in one horizontal rail/);

console.log("Presentation contract smoke test passed.");
