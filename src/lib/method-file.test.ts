import assert from "node:assert/strict";
import test from "node:test";

import { parseMethodFile } from "./method-file";

test("preserva o vínculo de plugin ao importar um Método", () => {
  const method = parseMethodFile(
    JSON.stringify({
      format: "contentflow-method",
      version: 1,
      name: "Método com plugin",
      exportedAt: "2026-08-27T00:00:00.000Z",
      method: {
        processType: "publishing",
        blocks: [
          {
            id: "check-destination",
            type: "BUSCAR",
            operator: "Código",
            parameters: [],
            order: 0,
            plugin: {
              pluginId: "com.example.publisher",
              capabilityId: "check-destination",
              configuration: { page_id: "local-only", simulate: true },
            },
          },
        ],
      },
    }),
  );

  assert.deepEqual(method.method.blocks[0]?.plugin, {
    pluginId: "com.example.publisher",
    capabilityId: "check-destination",
    configuration: { page_id: "local-only", simulate: true },
  });
});
