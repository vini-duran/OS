import assert from "node:assert/strict";
import test from "node:test";

import { execute } from "./handler.ts";

test("desempacota uma lista no envelope JSON da saída única", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      model: "gpt-5.6-terra",
      output_text: JSON.stringify({ theme_candidates: ["premissa A", "premissa B"] }),
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    });
  try {
    const result = await execute(
      {
        configuration: { model: "gpt-5.6-terra", max_output_tokens: 256 },
        inputs: {},
        outputContract: [
          {
            key: "theme_candidates",
            portKey: "result",
            label: "Temas",
            type: "list",
            required: true,
          },
        ],
        context: {
          channel: { name: "Spanish", language: "ES", niche: "Projeto próprio" },
          project: { title: "Teste" },
          processType: "theme",
          block: { type: "CRIAR", name: "Criar tema", instructions: "Teste" },
          previousProcessOutputs: [],
          previousBlockOutputs: [],
        },
      },
      { signal: new AbortController().signal, getSecret: async () => "test-key" },
    );
    assert.equal(result.status, "success");
    assert.deepEqual(result.values, { theme_candidates: ["premissa A", "premissa B"] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("preserva número que pertence ao conteúdo de uma lista em linhas", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      model: "gpt-5.6-terra",
      output_text: "1. Primer título\n7 días usando mis traslados para mejorar mi tienda",
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    });
  try {
    const result = await execute(
      {
        configuration: { model: "gpt-5.6-terra", max_output_tokens: 256 },
        inputs: {},
        outputContract: [
          {
            key: "title_candidates",
            portKey: "result",
            label: "Títulos",
            type: "list",
            required: true,
          },
        ],
        context: {
          channel: { name: "Spanish", language: "ES", niche: "Projeto próprio" },
          project: { title: "Teste" },
          processType: "title",
          block: { type: "CRIAR", name: "Criar títulos", instructions: "Teste" },
          previousProcessOutputs: [],
          previousBlockOutputs: [],
        },
      },
      { signal: new AbortController().signal, getSecret: async () => "test-key" },
    );
    assert.equal(result.status, "success");
    assert.deepEqual(result.values, {
      title_candidates: ["Primer título", "7 días usando mis traslados para mejorar mi tienda"],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remove cabeçalho repetido de uma lista em linhas", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      model: "gpt-5.6-terra",
      output_text: [
        "- thumbnail_concepts:",
        '- "personagem_objeto_limite | conceito A",',
        '- "marcador_de_continuidade | conceito B"',
      ].join("\n"),
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    });
  try {
    const result = await execute(
      {
        configuration: { model: "gpt-5.6-terra", max_output_tokens: 256 },
        inputs: {},
        outputContract: [
          {
            key: "thumbnail_concepts",
            portKey: "result",
            label: "Conceitos de thumbnail",
            type: "list",
            required: true,
          },
        ],
        context: {
          channel: { name: "Spanish", language: "ES", niche: "Projeto próprio" },
          project: { title: "Teste" },
          processType: "thumbnail",
          block: { type: "CRIAR", name: "Criar conceitos", instructions: "Teste" },
          previousProcessOutputs: [],
          previousBlockOutputs: [],
        },
      },
      { signal: new AbortController().signal, getSecret: async () => "test-key" },
    );
    assert.equal(result.status, "success");
    assert.deepEqual(result.values, {
      thumbnail_concepts: [
        "personagem_objeto_limite | conceito A",
        "marcador_de_continuidade | conceito B",
      ],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remove wrapper textarea de uma saída textual única", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      model: "gpt-5.6-terra",
      output_text: "<textarea>\nBLOQUE 1 — Apertura\nTexto do roteiro.\n</textarea>",
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    });
  try {
    const result = await execute(
      {
        configuration: { model: "gpt-5.6-terra", max_output_tokens: 256 },
        inputs: {},
        outputContract: [
          { key: "script", portKey: "result", label: "Roteiro", type: "textarea", required: true },
        ],
        context: {
          channel: { name: "Spanish", language: "ES", niche: "Projeto próprio" },
          project: { title: "Teste" },
          processType: "script",
          block: { type: "CRIAR", name: "Criar roteiro", instructions: "Teste" },
          previousProcessOutputs: [],
          previousBlockOutputs: [],
        },
      },
      { signal: new AbortController().signal, getSecret: async () => "test-key" },
    );
    assert.equal(result.status, "success");
    assert.deepEqual(result.values, { script: "BLOQUE 1 — Apertura\nTexto do roteiro." });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remove wrapper textarea com atributos de uma saída textual única", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      model: "gpt-5.6-terra",
      output_text:
        '<textarea id="script_candidate">\nBLOQUE 1 — Apertura\nTexto do roteiro.\n</textarea>',
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    });
  try {
    const result = await execute(
      {
        configuration: { model: "gpt-5.6-terra", max_output_tokens: 256 },
        inputs: {},
        outputContract: [
          { key: "script", portKey: "result", label: "Roteiro", type: "textarea", required: true },
        ],
        context: {
          channel: { name: "Spanish", language: "ES", niche: "Projeto próprio" },
          project: { title: "Teste" },
          processType: "script",
          block: { type: "CRIAR", name: "Criar roteiro", instructions: "Teste" },
          previousProcessOutputs: [],
          previousBlockOutputs: [],
        },
      },
      { signal: new AbortController().signal, getSecret: async () => "test-key" },
    );
    assert.equal(result.status, "success");
    assert.deepEqual(result.values, { script: "BLOQUE 1 — Apertura\nTexto do roteiro." });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
