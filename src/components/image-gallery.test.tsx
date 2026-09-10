import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageGallery } from "./image-gallery";

const images = Array.from({ length: 30 }, (_, index) => ({
  id: `fixture-${index}`,
  name: `image-${index}.png`,
  mimeType: "image/png",
  size: 10,
  url: `/fixture-${index}.png`,
}));

test("all 30 images have previews in one horizontal rail, not selection side effects", () => {
  let calls = 0;
  const before = JSON.stringify(images);
  const markup = renderToStaticMarkup(
    createElement(ImageGallery, {
      images,
      onToggle: () => {
        calls++;
      },
      selectedIds: new Set([images[2].id]),
    }),
  );
  assert.equal((markup.match(/aria-label="Ampliar imagem /g) ?? []).length, 30);
  assert.match(markup, /overflow-x-auto/);
  assert.match(markup, /Rolar imagens para a esquerda/);
  assert.match(markup, /Rolar imagens para a direita/);
  assert.equal((markup.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal(calls, 0);
  assert.equal(JSON.stringify(images), before);
});

test("read-only and single-image gallery do not offer selection or redundant scroll controls", () => {
  const markup = renderToStaticMarkup(createElement(ImageGallery, { images: images.slice(0, 1) }));
  assert.match(markup, /Ampliar imagem 1/);
  assert.doesNotMatch(markup, /Selecionar imagem|Rolar imagens/);
});
