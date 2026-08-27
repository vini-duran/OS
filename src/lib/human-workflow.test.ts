import assert from "node:assert/strict";
import test from "node:test";

import type { ProcessMethod } from "./domain";
import { getMethodConfigurationIssue } from "./human-workflow";

test("aceita uma lista herdada de bloco anterior sem duplicar o esquema", () => {
  const method: ProcessMethod = {
    processType: "publishing",
    blocks: [
      {
        id: "discover",
        type: "BUSCAR",
        operator: "Código",
        parameters: [],
        order: 0,
        outputs: [
          {
            id: "destinations",
            label: "Destinos",
            key: "destinations",
            type: "records",
            required: true,
            recordFields: [{ id: "platform", label: "Plataforma", key: "platform", type: "text", required: true }],
          },
        ],
      },
      {
        id: "confirm",
        type: "VALIDAR",
        operator: "Humano",
        parameters: [],
        order: 1,
        inputs: [{ id: "destinations", label: "Destinos", type: "records", source: "previous_block", sourceKey: "destinations" }],
        outputs: [{ id: "approval", label: "Aprovação", key: "approval", type: "approval", required: true }],
        validation: { targetBlockId: "discover", targetOutputKey: "destinations", mode: "approval", onReject: "pause", maxAttempts: 1 },
      },
    ],
  };

  assert.equal(getMethodConfigurationIssue(method), undefined);
});
