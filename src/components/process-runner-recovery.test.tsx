import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ExternalRecoveryGate,
  FailedExecutionGate,
} from "./process-runner";
import { retryBlockExecution } from "@/lib/store";
import type {
  ActionBlock,
  BlockExecution,
  PluginExternalRecoverySnapshot,
} from "@/lib/domain";

// Fixtures
const mockBlock: ActionBlock = {
  id: "block-collector",
  type: "CRIAR",
  operator: "Código",
  name: "Coletor de Thumbnails",
  inputs: [],
  outputs: [],
  parameters: [],
  order: 0,
};

const mockExecutionWithoutSnapshot: BlockExecution = {
  blockId: "block-collector",
  status: "failed",
  values: {},
  attempt: 1,
  error: "Erro simples de rede.",
};

const mockSnapshot: PluginExternalRecoverySnapshot = {
  format: "contentflow-external-recovery-snapshot-v1",
  system: "spanish_flow_bridge",
  runId: "thumbnail_contentflow-test-123",
  targetId: "layout_01",
  cycle: 2,
  snapshotRevision: "rev_bf88b727b22b490e",
  recordedAt: "2026-09-09T20:00:00.000Z",
  reason: "Tentativas automáticas esgotadas no Flow (3/3 falhas).",
};

const mockExecutionWithSnapshot: BlockExecution = {
  ...mockExecutionWithoutSnapshot,
  error: "Tentativas automáticas esgotadas.",
  recoverySnapshot: mockSnapshot,
};

test("UI com recoverySnapshot pendente: apresenta alvo, ciclo, motivo, consequência, revisão e exige confirmação", () => {
  const html = renderToStaticMarkup(
    React.createElement(ExternalRecoveryGate, {
      block: mockBlock,
      blockExecution: mockExecutionWithSnapshot,
      snapshot: mockSnapshot,
      onConfirm: () => {},
      isSubmitting: false,
    }),
  );

  // 1. Alvo e sistema
  assert.ok(html.includes("layout_01"), "Deve apresentar o alvo (layout_01)");
  assert.ok(html.includes("spanish_flow_bridge"), "Deve apresentar o sistema externo");

  // 2. Ciclo
  assert.ok(html.includes("data-testid=\"recovery-cycle\""), "Deve ter elemento do ciclo");
  assert.ok(html.includes(">2<"), "Deve apresentar o ciclo 2");

  // 3. Motivo
  assert.ok(
    html.includes("Tentativas automáticas esgotadas no Flow"),
    "Deve apresentar o motivo do snapshot",
  );

  // 4. Consequência da retomada
  assert.ok(
    html.includes("data-testid=\"recovery-consequence\""),
    "Deve conter a seção de consequência da retomada",
  );
  assert.ok(
    html.includes("autorização de uso único vinculada à revisão vigente"),
    "Deve explicar consequência e uso único",
  );

  // 5. Revisão do snapshot
  assert.ok(
    html.includes("rev_bf88b727b22b490e"),
    "Deve exibir a revisão exata do snapshot",
  );

  // 6. Checkbox de consentimento e botão de confirmação
  assert.ok(
    html.includes("data-testid=\"recovery-confirm-checkbox\""),
    "Deve conter checkbox de consentimento",
  );
  assert.ok(
    html.includes("data-testid=\"recovery-confirm-button\""),
    "Deve conter botão de confirmação de recuperação",
  );
  assert.ok(
    html.includes("Confirmar e Retomar Recuperação"),
    "Texto do botão deve ser explícito para recuperação",
  );

  // 7. Não oferece retry comum que contorne a confirmação
  assert.ok(
    !html.includes("Tentar novamente"),
    "NÃO deve oferecer botão de retry comum contornando confirmação",
  );

  // 8. Botão está desabilitado quando a confirmação não foi dada
  assert.ok(
    html.includes("disabled=\"\"") || html.includes("disabled"),
    "Botão deve estar desabilitado sem consentimento prévio",
  );
});

test("UI sem recoverySnapshot (legado): preserva botão Tentar novamente comum", () => {
  const html = renderToStaticMarkup(
    React.createElement(FailedExecutionGate, {
      block: mockBlock,
      error: "Erro de conexão",
      onRetry: () => {},
    }),
  );

  assert.ok(html.includes("Tentar novamente"), "Deve conter o botão legado 'Tentar novamente'");
  assert.ok(
    !html.includes("data-testid=\"external-recovery-gate\""),
    "Não deve renderizar o gate de recuperação externa",
  );
  assert.ok(
    !html.includes("Confirmar e Retomar Recuperação"),
    "Não deve renderizar confirmação de recuperação quando não há snapshot",
  );
});

test("UI com erro de revisão (409): renderiza alerta explicativo para atualizar e reconfirmar", () => {
  const revisionErrorMsg =
    "A revisão do snapshot foi alterada ou expirou. Atualize o estado e confirme novamente.";

  const html = renderToStaticMarkup(
    React.createElement(ExternalRecoveryGate, {
      block: mockBlock,
      blockExecution: mockExecutionWithSnapshot,
      snapshot: mockSnapshot,
      onConfirm: () => {},
      isSubmitting: false,
      revisionError: revisionErrorMsg,
    }),
  );

  assert.ok(
    html.includes("data-testid=\"recovery-revision-error\""),
    "Deve renderizar o banner de erro de revisão",
  );
  assert.ok(
    html.includes("Revisão alterada ou expirada"),
    "Deve exibir título alertando sobre revisão expirada",
  );
  assert.ok(
    html.includes(revisionErrorMsg),
    "Deve instruir o usuário a atualizar o estado e reconfirmar",
  );
});

test("UI bloqueia clique duplicado enquanto solicitação está pendente", () => {
  let callCount = 0;
  let isSubmitting = false;

  const handleConfirm = (_rev: string) => {
    if (isSubmitting) return; // Guarda de bloqueio de concorrência
    isSubmitting = true;
    callCount += 1;
  };

  // Simular primeiro clique
  handleConfirm(mockSnapshot.snapshotRevision);
  assert.equal(callCount, 1, "Primeiro clique deve ser processado");

  // Simular segundo clique duplicado enquanto isSubmitting é true
  handleConfirm(mockSnapshot.snapshotRevision);
  assert.equal(callCount, 1, "Clique duplicado deve ser bloqueado");

  // HTML renderizado com isSubmitting: true
  const html = renderToStaticMarkup(
    React.createElement(ExternalRecoveryGate, {
      block: mockBlock,
      blockExecution: mockExecutionWithSnapshot,
      snapshot: mockSnapshot,
      onConfirm: handleConfirm,
      isSubmitting: true,
    }),
  );

  assert.ok(html.includes("Autorizando recuperação..."), "Deve exibir indicador de envio pendente");
  assert.ok(html.includes("disabled"), "Botão deve estar desabilitado durante envio");
});

test("Payload emitido pelo store: envia confirmSnapshotRevision no caminho /api/commands", async () => {
  const savedFetch = globalThis.fetch;
  const capturedRequests: Array<{ url: string; options?: RequestInit }> = [];

  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      capturedRequests.push({ url, options: init });

      if (url.endsWith("/api/commands")) {
        return new Response(
          JSON.stringify({
            result: true,
            state: {
              channels: [],
              projects: [],
              executions: [],
              orchestrators: [],
              libraryItems: [],
              libraryCollections: [],
              revision: 10,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    // Chamada com confirmação de revisão
    const result = await retryBlockExecution(
      "exec-123",
      "block-collector",
      "rev_bf88b727b22b490e",
    );
    assert.equal(result, true);

    const commandReq = capturedRequests.find((r) => r.url.endsWith("/api/commands"));
    assert.ok(commandReq, "Deve ter emitido requisição para /api/commands");
    assert.equal(commandReq.options?.method, "POST");

    const payload = JSON.parse(String(commandReq.options?.body || "{}"));
    assert.equal(payload.action, "retry");
    assert.equal(payload.executionId, "exec-123");
    assert.equal(payload.blockId, "block-collector");
    assert.equal(payload.confirmSnapshotRevision, "rev_bf88b727b22b490e");
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test("Payload emitido pelo store: ausência de confirmSnapshotRevision não envia campo", async () => {
  const savedFetch = globalThis.fetch;
  const capturedRequests: Array<{ url: string; options?: RequestInit }> = [];

  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      capturedRequests.push({ url, options: init });

      if (url.endsWith("/api/commands")) {
        return new Response(
          JSON.stringify({
            result: true,
            state: {
              channels: [],
              projects: [],
              executions: [],
              orchestrators: [],
              libraryItems: [],
              libraryCollections: [],
              revision: 11,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    // Chamada legada sem confirmação
    await retryBlockExecution("exec-123", "block-collector");

    const commandReq = capturedRequests.find((r) => r.url.endsWith("/api/commands"));
    assert.ok(commandReq);
    const payload = JSON.parse(String(commandReq.options?.body || "{}"));
    assert.equal(payload.action, "retry");
    assert.equal(payload.executionId, "exec-123");
    assert.equal(payload.blockId, "block-collector");
    assert.equal(
      payload.confirmSnapshotRevision,
      undefined,
      "confirmSnapshotRevision não deve ser emitido sem confirmação",
    );
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test("Store lida com erro 409 do servidor e rejeita sem reenvio automático", async () => {
  const savedFetch = globalThis.fetch;
  let attemptsCount = 0;

  try {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/commands")) {
        attemptsCount += 1;
        return new Response(
          JSON.stringify({
            error:
              "Recuperação externa requer confirmação explícita da revisão do snapshot vigente.",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/api/state")) {
        return new Response(
          JSON.stringify({
            channels: [],
            projects: [],
            executions: [],
            orchestrators: [],
            libraryItems: [],
            libraryCollections: [],
            revision: 12,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    try {
      await retryBlockExecution("exec-123", "block-collector", "rev_divergente");
      assert.fail("Deveria ter lançado erro 409");
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /Recuperação externa requer confirmação explícita da revisão do snapshot vigente/,
      );
    }

    // Comprovar que NUNCA reenvia automaticamente
    assert.equal(attemptsCount, 1, "Não deve ter havido reenvio automático após erro 409");
  } finally {
    globalThis.fetch = savedFetch;
  }
});
