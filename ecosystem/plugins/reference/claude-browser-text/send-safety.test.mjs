import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { failedTurn, preSendProviderError, providerError } from './response-guard.mjs';

const source = readFileSync(new URL('./handler.mjs', import.meta.url), 'utf8');
function realFunction(name, dependencies) {
  const start = source.indexOf(`async function ${name}(`);
  assert.ok(start >= 0);
  const end = source.indexOf('\nasync function ', start + 1);
  assert.ok(end > start);
  return vm.runInNewContext(`${source.slice(start, end)}; ${name}`, dependencies);
}
const codedError = (code, message, retryable = false) => Object.assign(new Error(message), { code, retryable });

test('lost send acknowledgement never authorizes another send', async () => {
  let sends = 0;
  const lifecycle = { submitted: false };
  const fn = realFunction('generatePart', {
    responseState: async () => ({ texts: [], notices: [] }),
    preSendProviderError, codedError,
    setPrompt: async () => {},
    clickSend: async () => { sends++; throw codedError('UPSTREAM_UNAVAILABLE', 'ack lost', true); },
  });
  await assert.rejects(fn(null, null, null, 'prompt', {}, undefined, 'test', lifecycle), error => {
    assert.equal(failedTurn(error, lifecycle.submitted).retryable, false);
    return true;
  });
  assert.equal(sends, 1);
});

test('quota before send does not send or enable profile rotation', async () => {
  const fn = realFunction('generatePart', {
    responseState: async () => ({ texts: [], notices: ["You've reached your usage limit"] }),
    preSendProviderError, codedError,
    setPrompt: async () => assert.fail('must not write'),
  });
  await assert.rejects(fn(null, null, null, 'prompt', {}, undefined, 'test', {}), { code: 'RATE_LIMIT', retryable: false });
});

test('send retries only a definite CONTROL_NOT_FOUND response', async () => {
  const fn = realFunction('clickSend', { sleep: async () => {} });
  let calls = 0;
  await fn({ dispatch: async () => {
    calls++;
    if (calls === 1) throw Object.assign(codedError('OUTPUT_VALIDATION_FAILED', 'missing'), { bridgeCode: 'CONTROL_NOT_FOUND' });
    return { ok: true };
  } }, 'send', undefined);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(fn({ dispatch: async () => {
    calls++;
    throw codedError('OUTPUT_VALIDATION_FAILED', 'uncertain');
  } }, 'send', undefined));
  assert.equal(calls, 1);
});

for (const delayedNewResponse of [false, true]) {
  test(`old response is not accepted as new; delayed new=${delayedNewResponse}`, async () => {
    let clock = 0, polls = 0;
    const fn = realFunction('waitForResponse', {
      Date: { now: () => clock }, codedError, providerError,
      responseState: async () => {
        polls++;
        return { texts: delayedNewResponse && polls >= 5 ? ['old', 'new'] : ['old'], notices: [], stop: false };
      },
      responsePhase: ({ hasNewResponse, generating, stablePolls }) => hasNewResponse && !generating && stablePolls >= 2 ? 'completed' : 'waiting',
      sleep: async () => {},
      waitForDomMutation: async () => { clock += 1000; },
    });
    if (delayedNewResponse) assert.equal((await fn(null, null, 1, 12000)).text, 'new');
    else await assert.rejects(fn(null, null, 1, 12000), { code: 'TIMEOUT' });
  });
}
