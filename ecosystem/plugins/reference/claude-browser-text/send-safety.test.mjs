import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  canRetryTurn,
  failedTurn,
  preSendProviderError,
  providerError,
} from "./response-guard.mjs";

const source = readFileSync(new URL("./handler.mjs", import.meta.url), "utf8");
function realFunction(name, dependencies) {
  const start = source.indexOf(`async function ${name}(`);
  assert.ok(start >= 0);
  const end = source.indexOf("\nasync function ", start + 1);
  assert.ok(end > start);
  return vm.runInNewContext(`${source.slice(start, end)}; ${name}`, dependencies);
}
const codedError = (code, message, retryable = false) =>
  Object.assign(new Error(message), { code, retryable });

test("automation activates only its own new page before writing", async () => {
  const calls = [];
  const client = {
    send: async (method, params) => {
      calls.push({ method, params });
      if (method === "Target.getTargets")
        return {
          targetInfos: [
            { type: "page", targetId: "original", url: "https://claude.ai/chat/original" },
          ],
        };
      if (method === "Target.createTarget") return { targetId: "owned" };
      if (method === "Target.attachToTarget") return { sessionId: "owned-session" };
      return {};
    },
  };
  const fn = realFunction("attachClaudePage", {
    CLAUDE_HOST: "claude.ai",
    CLAUDE_NEW_URL: "https://claude.ai/new",
    evaluate: async () => ({ readyState: "complete" }),
    codedError,
    Date,
  });
  const page = await fn(client, undefined, true, true);
  assert.equal(page.targetId, "owned");
  assert.equal(calls.find((c) => c.method === "Target.createTarget").params.background, false);
  assert.equal(calls.find((c) => c.method === "Target.activateTarget").params.targetId, "owned");
  assert.ok(calls.some((c) => c.method === "Page.bringToFront"));
  assert.match(
    source,
    /const taskPage = await attachClaudePage\(\s*client,\s*services.signal,\s*true,/,
  );
});

test("lost send acknowledgement never authorizes another send", async () => {
  let sends = 0;
  const lifecycle = { submitted: false };
  const fn = realFunction("generatePart", {
    waitForTurnReady: async () => ({ texts: [] }),
    clampInteger: () => 600,
    preSendProviderError,
    codedError,
    setPrompt: async () => {},
    clickSend: async () => {
      sends++;
      throw codedError("UPSTREAM_UNAVAILABLE", "ack lost", true);
    },
  });
  await assert.rejects(
    fn(null, null, null, "prompt", {}, undefined, "test", lifecycle),
    (error) => {
      assert.equal(failedTurn(error, lifecycle.submitted).retryable, false);
      return true;
    },
  );
  assert.equal(sends, 1);
});

test("quota before send does not send or enable profile rotation", async () => {
  const fn = realFunction("generatePart", {
    waitForTurnReady: async () => {
      throw codedError("RATE_LIMIT", "Quota", false);
    },
    clampInteger: () => 600,
    preSendProviderError,
    codedError,
    setPrompt: async () => assert.fail("must not write"),
  });
  await assert.rejects(fn(null, null, null, "prompt", {}, undefined, "test", {}), {
    code: "RATE_LIMIT",
    retryable: false,
  });
});

test("send retries only a definite CONTROL_NOT_FOUND response", async () => {
  const fn = realFunction("clickSend", { sleep: async () => {} });
  let calls = 0;
  await fn(
    {
      dispatch: async () => {
        calls++;
        if (calls === 1)
          throw Object.assign(codedError("OUTPUT_VALIDATION_FAILED", "missing"), {
            bridgeCode: "CONTROL_NOT_FOUND",
          });
        return { ok: true };
      },
    },
    "send",
    undefined,
  );
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(
    fn(
      {
        dispatch: async () => {
          calls++;
          throw codedError("OUTPUT_VALIDATION_FAILED", "uncertain");
        },
      },
      "send",
      undefined,
    ),
  );
  assert.equal(calls, 1);
});

for (const delayedNewResponse of [false, true]) {
  test(`old response is not accepted as new; delayed new=${delayedNewResponse}`, async () => {
    let clock = 0,
      polls = 0;
    const fn = realFunction("waitForResponse", {
      Date: { now: () => clock },
      codedError,
      providerError,
      responseState: async () => {
        polls++;
        return {
          texts: delayedNewResponse && polls >= 5 ? ["old", "new"] : ["old"],
          notices: [],
          stop: false,
          promptReady: true,
        };
      },
      responsePhase: ({ hasNewResponse, generating, stablePolls }) =>
        hasNewResponse && !generating && stablePolls >= 2 ? "completed" : "waiting",
      sleep: async () => {},
      waitForDomMutation: async () => {
        clock += 1000;
      },
    });
    if (delayedNewResponse) assert.equal((await fn(null, null, 1, 12000)).text, "new");
    else await assert.rejects(fn(null, null, 1, 12000), { code: "TIMEOUT" });
  });
}

function simulatedLoop(name, states) {
  let time = 0,
    index = 0;
  const fn = realFunction(name, {
    Date: { now: () => time },
    codedError,
    providerError,
    preSendProviderError,
    responseState: async () => states[Math.min(index++, states.length - 1)],
    waitForDomMutation: async () => {
      time += 1000;
    },
    sleep: async (ms) => {
      time += ms;
    },
    responsePhase: ({ hasNewResponse, generating, stablePolls }) =>
      hasNewResponse && !generating && stablePolls >= 2 ? "completed" : "waiting",
  });
  return { fn, reads: () => index };
}
const ready = {
  texts: ["previous"],
  promptReady: true,
  sendReady: true,
  promptText: "next",
  notices: [],
  generating: false,
};

test("busy composer waits and requires stable idle before the next write", async () => {
  const { fn, reads } = simulatedLoop("waitForTurnReady", [
    { ...ready, generating: true },
    { ...ready, generating: true },
    ready,
  ]);
  await fn(null, null, 10000);
  assert.equal(reads(), 5);
});
test("disabled send waits without dispatch; timeout is not retryable", async () => {
  const { fn } = simulatedLoop("waitForTurnReady", [{ ...ready, sendReady: false }]);
  await assert.rejects(fn(null, null, 4000, undefined, true), {
    code: "TIMEOUT",
    retryable: false,
  });
});
test("preflight explicit quota pauses immediately", async () => {
  const { fn, reads } = simulatedLoop("waitForTurnReady", [
    { ...ready, notices: ["You've reached your usage limit"] },
  ]);
  await assert.rejects(fn(null, null, 10000), { code: "RATE_LIMIT", retryable: false });
  assert.equal(reads(), 1);
});
test("cancellation prevents readiness polling", async () => {
  const { fn, reads } = simulatedLoop("waitForTurnReady", [ready]);
  await assert.rejects(fn(null, null, 10000, { aborted: true }), { code: "CANCELLED" });
  assert.equal(reads(), 0);
});
test("submission requires cleared composer or a new response, not just spinner", async () => {
  const { fn } = simulatedLoop("waitForSubmission", [{ ...ready, generating: true }]);
  await assert.rejects(fn(null, null, 1, 3000), { code: "TIMEOUT", retryable: false });
  await simulatedLoop("waitForSubmission", [{ ...ready, promptText: "" }]).fn(null, null, 1, 3000);
  await simulatedLoop("waitForSubmission", [{ ...ready, texts: ["previous", "new"] }]).fn(
    null,
    null,
    1,
    3000,
  );
});
test("missing composer is not submission acknowledgement", async () => {
  const { fn } = simulatedLoop("waitForSubmission", [
    { ...ready, promptReady: false, promptText: null },
  ]);
  await assert.rejects(fn(null, null, 1, 3000), { code: "TIMEOUT", retryable: false });
});
test("streaming without a stop button does not complete a response", async () => {
  const { fn } = simulatedLoop("waitForResponse", [
    { ...ready, texts: ["previous", "new"], stop: false, generating: true },
  ]);
  await assert.rejects(fn(null, null, 1, 6000), { code: "TIMEOUT" });
});
test("generatePart orders readiness, write, send readiness, one send, ack and capture", async () => {
  const actions = [];
  const fn = realFunction("generatePart", {
    clampInteger: () => 600,
    waitForTurnReady: async (...args) => {
      actions.push(args[4] ? "send-ready" : "idle");
      return ready;
    },
    setPrompt: async () => actions.push("write"),
    clickSend: async () => actions.push("send"),
    waitForSubmission: async () => actions.push("ack"),
    waitForResponse: async () => {
      actions.push("capture");
      return { text: "new" };
    },
  });
  const lifecycle = {};
  assert.equal(
    (await fn(null, null, null, "next", {}, undefined, "item-4", lifecycle)).text,
    "new",
  );
  assert.deepEqual(actions, ["idle", "write", "send-ready", "send", "ack", "capture"]);
  assert.equal(lifecycle.submitted, true);
});
test("internal retries also stop after any attempted send", () => {
  assert.equal(canRetryTurn(codedError("TIMEOUT", "late", true), true), false);
  assert.equal(canRetryTurn(codedError("UPSTREAM_UNAVAILABLE", "before", true), false), true);
  assert.match(source, /!canRetryTurn\(error, lifecycle\.submitted\)/);
});

test("DOM adapter recognizes streaming, disabled send, title label and composer busy", () => {
  class Element {
    constructor(attrs = {}, text = "") {
      this.attrs = attrs;
      this.innerText = text;
    }
    getAttribute(name) {
      return this.attrs[name] ?? null;
    }
    getBoundingClientRect() {
      return { width: 100, height: 40, bottom: 100, right: 100 };
    }
    closest(selector) {
      return selector === '[aria-busy="true"]' && this.busy ? this : null;
    }
    querySelectorAll() {
      return [];
    }
  }
  const prompt = new Element({}, "next");
  const send = new Element({ title: "Send message" });
  const answer = new Element({}, "response");
  const stream = new Element();
  let streaming = true;
  const document = {
    body: { innerText: "" },
    querySelectorAll(selector) {
      if (selector === '[contenteditable="true"][role="textbox"]') return [prompt];
      if (selector === ".standard-markdown") return [answer];
      if (selector === "button") return [send];
      if (selector === '[data-is-streaming="true"]') return streaming ? [stream] : [];
      return [];
    },
  };
  const start =
    source.indexOf("const PAGE_HELPERS = String.raw`") + "const PAGE_HELPERS = String.raw`".length;
  const end = source.indexOf("\n`;", start);
  const read = vm.runInNewContext(`${source.slice(start, end)}; cfResponseState`, {
    Element,
    document,
    location: { href: "https://claude.ai/chat/test" },
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
  });
  assert.equal(read().stop, false);
  assert.equal(read().generating, true);
  assert.equal(read().sendReady, true);
  streaming = false;
  send.disabled = true;
  assert.equal(read().sendReady, false);
  assert.equal(read().generating, false);
  prompt.busy = true;
  assert.equal(read().generating, true);
  prompt.attrs["aria-disabled"] = "true";
  assert.equal(read().promptReady, false);
});
