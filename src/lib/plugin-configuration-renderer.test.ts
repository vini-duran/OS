import assert from "node:assert/strict";
import test from "node:test";
import { buildPluginConfigurationRendererModel } from "./plugin-configuration-renderer";
import {
  clonePluginConfigurationDraft,
  preparePluginConfigurationCommit,
} from "./plugin-configuration-draft";

test("separa campos avançados declarados pelo plugin e preserva a ordem", () => {
  const model = buildPluginConfigurationRendererModel({
    capability: {
      id: "demo",
      blockTypes: ["CRIAR"],
      operator: "Código",
      inputPorts: [],
      outputPorts: [],
      execution: { mode: "immediate" },
      sideEffects: [],
      cost: { model: "free", estimateSupported: false },
      dataPolicy: { sendsDataToThirdParties: false },
      blockConfigSchema: {
        type: "object",
        properties: {
          advanced: { type: "number", ui: { section: "advanced", order: 1 } },
          primary: { type: "string", ui: { section: "primary", order: 0 } },
        },
      },
      outputSchema: { type: "object" },
    } as never,
    configuration: {},
  });
  assert.deepEqual(
    model.capabilityEntries.map(([key]) => key),
    ["primary"],
  );
  assert.deepEqual(
    model.advancedEntries.map(([key]) => key),
    ["advanced"],
  );
});

test("renders plugin execution choices normally and applies declared visibility defaults", () => {
  const capability = {
    blockConfigSchema: {
      properties: {
        generationMode: { type: "string", default: "custom", title: "Plugin mode" },
        references: {
          type: "boolean",
          visibleWhen: { property: "generationMode", values: ["custom"] },
        },
      },
    },
    execution: { itemOrchestration: { mode: "sequential" } },
  } as never;
  const defaults = buildPluginConfigurationRendererModel({ capability, configuration: {} });
  assert.deepEqual(
    defaults.capabilityEntries.map(([key]) => key),
    ["generationMode", "references"],
  );
  const changed = buildPluginConfigurationRendererModel({
    capability,
    configuration: { generationMode: "other" },
  });
  assert.deepEqual(
    changed.capabilityEntries.map(([key]) => key),
    ["generationMode"],
  );
  assert.deepEqual(Object.keys(defaults), ["capabilityEntries", "advancedEntries"]);
});

test("hides the runtime-managed project URL field and keeps functional fields", () => {
  const capability = {
    id: "demo",
    blockTypes: ["CRIAR"],
    operator: "Código",
    inputPorts: [],
    outputPorts: [],
    execution: { mode: "immediate" },
    sideEffects: [],
    cost: { model: "free", estimateSupported: false },
    dataPolicy: { sendsDataToThirdParties: false },
    blockConfigSchema: {
      type: "object",
      properties: {
        model: { type: "string" },
        projectUrl: { type: "string" },
      },
    },
    outputSchema: { type: "object" },
  } as never;
  const profileSetup = {
    configurationKey: "profile",
    label: "Perfil",
    namedUrls: { allowedHosts: ["flow.example.com"], configurationKey: "projectUrl" },
  } as never;
  const model = buildPluginConfigurationRendererModel({
    capability,
    configuration: { model: "best", projectUrl: "https://flow.example.com/p/a" },
    profileSetup,
  });
  assert.deepEqual(
    model.capabilityEntries.map(([key]) => key),
    ["model"],
  );
  assert.deepEqual(
    model.advancedEntries.map(([key]) => key),
    [],
  );
});

test("draft commit skips the managed URL requirement and strips stale values", () => {
  const capability = {
    id: "demo",
    blockTypes: ["CRIAR"],
    operator: "Código",
    inputPorts: [],
    outputPorts: [],
    execution: { mode: "immediate" },
    sideEffects: [],
    cost: { model: "free", estimateSupported: false },
    dataPolicy: { sendsDataToThirdParties: false },
    blockConfigSchema: {
      type: "object",
      required: ["projectUrl"],
      properties: {
        model: { type: "string" },
        projectUrl: { type: "string" },
      },
    },
    outputSchema: { type: "object" },
  } as never;
  const profileSetup = {
    configurationKey: "profile",
    label: "Perfil",
    namedUrls: { allowedHosts: ["flow.example.com"], configurationKey: "projectUrl" },
  } as never;
  const {
    preparePluginConfigurationCommit: commitDraft,
    clonePluginConfigurationDraft: cloneDraft,
  } = { preparePluginConfigurationCommit, clonePluginConfigurationDraft };
  const draft = {
    pluginId: "com.example.flow",
    capabilityId: "demo",
    configuration: { model: "best", projectUrl: "https://flow.example.com/p/stale" },
    profileExecution: {
      mode: "fallback",
      profileIds: ["profile-a"],
      projectSelections: { "profile-a": "entry-1" },
    },
  } as never;
  const cloned = cloneDraft(draft);
  assert.deepEqual(cloned.profileExecution?.projectSelections, { "profile-a": "entry-1" });
  const commit = commitDraft(capability, draft, profileSetup);
  assert.equal(commit.ok, true);
  if (commit.ok) {
    assert.equal(commit.value.configuration.projectUrl, undefined);
    assert.equal(commit.value.configuration.model, "best");
    assert.deepEqual(commit.value.profileExecution?.projectSelections, { "profile-a": "entry-1" });
  }
});
