import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_PROJECT_CLEANUP_STATUSES,
  normalizeProjectCleanupStatuses,
  projectCleanupConfigurationIssue,
} from "./project-cleanup";

test("normaliza somente estados finais permitidos pelo operador", () => {
  assert.deepEqual(
    normalizeProjectCleanupStatuses({
      cutmotions_final_status: "REJECTED",
      instagram_final_status: "deleted",
      facebook_final_status: "published",
      youtube_final_status: " scheduled ",
    }),
    {
      cutmotions_final_status: "rejected",
      instagram_final_status: "deleted",
      facebook_final_status: "published",
      youtube_final_status: "scheduled",
    },
  );
  assert.deepEqual(normalizeProjectCleanupStatuses(null), EMPTY_PROJECT_CLEANUP_STATUSES);
});

test("exige configuração completa para expor a ação", () => {
  assert.match(projectCleanupConfigurationIssue() ?? "", /Configure/);
  assert.equal(
    projectCleanupConfigurationIssue({
      pluginId: "com.contentflow.production-retention",
      previewCapabilityId: "preview-production-retention",
      applyCapabilityId: "apply-production-retention",
      configuration: {},
    }),
    undefined,
  );
});
