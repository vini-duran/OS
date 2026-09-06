import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const { providerError } = await import(new URL("../ecosystem/plugins/reference/gemini-browser-studio/response-guard.mjs", import.meta.url).href);

// Execute the real polling functions offline. No provider or browser is opened.
function extract(source: string, name: string) {
  const start = source.indexOf(`async function ${name}(`);
  const end = source.indexOf("\nasync function ", start + 1);
  return source.slice(start, end);
}
for (const provider of ["gemini-browser-studio", "claude-browser-text"]) {
  const source = readFileSync(`ecosystem/plugins/reference/${provider}/handler.mjs`, "utf8");
  const gemini = provider.startsWith("gemini");
  async function run(notices: string[] = [], neverCompletes = false) {
    let polls = 0,
      sends = 0,
      clock = 0;
    const context = vm.createContext({
      Date: { now: () => clock },
      providerError,
      responseState: async () => {
        polls++;
        const done = polls >= 5 && !neverCompletes;
        return {
          texts: done ? ["Resposta final correta"] : [],
          entries: [],
          stop: !done,
          promptReady: done,
          body: "Upgrade. Explique limites, rate limit e captcha.",
          bodyHint: "usage limit / try again later / verify you are human",
          notices: polls > 1 ? notices : [],
        };
      },
      responsePhase: ({ hasNewResponse, generating, stablePolls }: any) =>
        hasNewResponse && !generating && stablePolls >= 2 ? "completed" : "waiting",
      setPrompt: async () => {},
      send: async () => {
        sends++;
      },
      clamp: () => 30,
      waitForDomMutation: async () => {
        clock += 1000;
      },
      sleep: async () => {},
      err: (code: string, message: string, retryable: boolean) =>
        Object.assign(new Error(message), { code, retryable }),
      codedError: (code: string, message: string, retryable: boolean) =>
        Object.assign(new Error(message), { code, retryable }),
    });
    const fn = vm.runInContext(
      extract(source, gemini ? "textTurn" : "waitForResponse") +
        `; ${gemini ? "textTurn" : "waitForResponse"}`,
      context,
    );
    const lifecycle = { submitted: false };
    const result = gemini
      ? fn(null, null, null, "prompt", {}, undefined, "test", lifecycle)
      : fn(null, null, 0, 30000, undefined);
    return { result, stats: () => ({ polls, sends, lifecycle }) };
  }
  test(`${provider}: normal page text does not interrupt a delayed response`, async () => {
    const x = await run();
    assert.equal((await x.result).text, "Resposta final correta");
    assert.ok(x.stats().polls >= 7);
    if (gemini) {
      assert.equal(x.stats().sends, 1);
      assert.equal(x.stats().lifecycle.submitted, true);
    }
  });
  test(`${provider}: explicit notice stops without internal resend`, async () => {
    const x = await run(["You've reached your usage limit"]);
    await assert.rejects(x.result, { code: "RATE_LIMIT", retryable: false });
    if (gemini) assert.equal(x.stats().sends, 1);
  });
  test(`${provider}: missing response times out instead of fabricating a quota error`, async () => {
    const x = await run([], true);
    await assert.rejects(x.result, { code: "TIMEOUT" });
    if (gemini) assert.equal(x.stats().sends, 1);
  });
}
