import assert from "node:assert/strict";
import test from "node:test";
import {
  DAILY_RESEARCH_CAPABILITY_ID,
  DAILY_RESEARCH_PLUGIN_ID,
  dailyResearchInputContract,
  dailyResearchOutputContract,
  isDailyResearchConfig,
} from "./channel-research";

test("aceita somente um plano diário limitado e com capability explícita", () => {
  const config = {
    pluginId: DAILY_RESEARCH_PLUGIN_ID,
    capabilityId: DAILY_RESEARCH_CAPABILITY_ID,
    cadence: "manual_daily",
    language: "es",
    region: "MX",
    minDurationSeconds: 180,
    maxResults: 20,
    maxCommentVideoSamples: 10,
    maxEstimatedQuotaUnits: 1100,
    queries: [
      { id: "core", text: "proyecto personal después del trabajo", referenceLane: "core_faceless" },
    ],
  } as const;
  assert.equal(isDailyResearchConfig(config), true);
  assert.equal(isDailyResearchConfig({ ...config, queries: [] }), false);
  assert.equal(isDailyResearchConfig({ ...config, capabilityId: "anything" }), false);
  assert.deepEqual(
    dailyResearchInputContract().map((item) => item.portKey),
    ["consultas_es"],
  );
  assert.deepEqual(
    dailyResearchOutputContract().map((item) => item.portKey),
    ["videos", "preflight"],
  );
});
