import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { testExtensionBridge } from "./test.mjs";
const source = readFileSync(new URL("./service-worker.js", import.meta.url), "utf8");
test("legacy providers and 300 cached commands remain compatible", () =>
  testExtensionBridge(source));

function fixture() {
  const sent = [],
    storage = {};
  let tabs = [
    { id: 11, url: "https://claude.ai/new" },
    { id: 22, url: "https://claude.ai/new" },
  ];
  const markers = new Map([[22, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]]);
  const context = {
    URL,
    Date,
    setTimeout,
    clearTimeout,
    chrome: {
      runtime: { getManifest: () => ({ version: "candidate" }), onMessage: { addListener() {} } },
      storage: {
        session: {
          get: async (key) => ({ [key]: storage[key] }),
          set: async (value) => Object.assign(storage, value),
        },
      },
      tabs: {
        query: async () => tabs,
        sendMessage: async (id, message) => {
          if (message.action === "inspect") {
            if (!markers.has(id)) throw new Error("Old content script absent");
            return { ok: true, tabMarker: markers.get(id) };
          }
          sent.push({ id, message });
          return { ok: true };
        },
      },
    },
  };
  vm.runInNewContext(source, context);
  const bridge = context.contentFlowBridge;
  const session = {
    pluginId: "local.contentflow.claude-browser-text",
    profileId: "test",
    protocolVersion: 2,
    sessionToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
  bridge.connect(session);
  const bind = (override = {}) =>
    bridge.bindPage({
      ...session,
      expectedUrl: "https://claude.ai/new",
      tabMarker: markers.get(22),
      ...override,
    });
  const command = () => ({
    ...session,
    executionKey: "execution-test-tab-binding",
    commandId: createHash("sha256").update("click-once").digest("hex"),
    issuedAt: Date.now(),
    expiresAt: Date.now() + 30000,
    expectedUrl: "https://claude.ai/new",
    action: "click",
    payload: {},
  });
  return {
    bridge,
    bind,
    command,
    sent,
    markers,
    setTabs: (value) => {
      tabs = value;
    },
  };
}
test("two identical URLs: bind correct page, never first matching URL", async () => {
  const f = fixture();
  assert.equal((await f.bind()).tabId, 22);
  assert.equal((await f.bridge.dispatch(f.command())).ok, true);
  assert.deepEqual(
    f.sent.map((s) => s.id),
    [22],
  );
});
test("closed bound page cannot fall back to another tab with same URL", async () => {
  const f = fixture();
  await f.bind();
  f.setTabs([{ id: 11, url: "https://claude.ai/new" }]);
  assert.equal((await f.bridge.dispatch(f.command())).code, "PLUGIN_TAB_NOT_FOUND");
  assert.equal(f.sent.length, 0);
});
test("ambiguous marker and invalid session fail closed", async () => {
  const f = fixture();
  f.markers.set(11, f.markers.get(22));
  assert.equal((await f.bind()).code, "PLUGIN_TAB_NOT_FOUND");
  assert.equal((await f.bind({ sessionToken: "bad" })).code, "SESSION_MISMATCH");
});
test("binding rejects an unapproved origin", async () => {
  const f = fixture();
  assert.equal(
    (await f.bind({ expectedUrl: "https://example.com/new" })).code,
    "ORIGIN_NOT_ALLOWED",
  );
});
test("same command is cached only for its bound tab", async () => {
  const f = fixture();
  await f.bind();
  const c = f.command();
  await f.bridge.dispatch(c);
  assert.equal((await f.bridge.dispatch(c)).replayed, true);
  f.markers.set(11, "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  assert.equal((await f.bind({ tabMarker: f.markers.get(11) })).tabId, 11);
  await f.bridge.dispatch(c);
  assert.deepEqual(
    f.sent.map((s) => s.id),
    [22, 11],
  );
});
