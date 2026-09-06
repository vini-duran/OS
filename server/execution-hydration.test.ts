import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual store functions with persistence/network replaced by fixtures.
// Importing store directly would auto-hydrate and couple tests to React/browser IO.
const source = fs.readFileSync(new URL('../src/lib/store.ts', import.meta.url), 'utf8');
function functionSource(start: string, end: string) {
  const offset = source.indexOf(start);
  assert(offset >= 0, `Could not find start "${start}" in store.ts`);
  const endOffset = source.indexOf(end, offset);
  assert(endOffset >= 0, `Could not find end "${end}" in store.ts`);
  return ts.transpileModule(source.slice(offset, endOffset).replace(/^export\s+/gm, ''), {
    compilerOptions: {target: ts.ScriptTarget.ES2022},
  }).outputText;
}

const normalizeExecutionCode = functionSource('function normalizeExecution(', 'type ServerState');
const applyStateCode = functionSource('function reconcileEntities<', 'export async function refreshState(');
const refreshStateCode = functionSource('export async function refreshState(', 'if (typeof window !== "undefined") {');

const method = {processType:'thumbnail', blocks:[
  {id:'generate',operator:'Código'}, {id:'select',operator:'Humano'}, {id:'promote',operator:'Código'},
]};
const fixture = () => ({id:'run',channelId:'channel',projectId:'project',processType:'thumbnail',status:'awaiting_human',
  methodSnapshot:structuredClone(method),blocks:[
    {blockId:'generate',status:'completed',attempt:2,values:{images:['a','b','c']}},
    {blockId:'select',status:'awaiting_human',attempt:2,values:{selected_values:['a','b','c']}},
    {blockId:'promote',status:'pending',attempt:3,values:{}},
  ]});

test('normalizeExecution preserves reserved attempt identities and completed values', () => {
  const context: any = vm.createContext({
    normalizeExecutionDeliveries: (x: any) => x,
  });
  vm.runInContext(normalizeExecutionCode, context);
  const normalized = context.normalizeExecution(fixture());
  assert.equal(normalized.blocks[0].attempt, 2);
  assert.equal(normalized.blocks[1].attempt, 2);
  assert.equal(normalized.blocks[2].attempt, 3);
  assert.deepEqual(normalized.blocks[1].values.selected_values, ['a', 'b', 'c']);
});

test('refreshState preserves reserved retries, human decisions and failed states without writes', async () => {
  for (const status of ['awaiting_human', 'failed']) {
    const execution = fixture();
    execution.status = status;
    const serverState = {
      revision: 1,
      channels: [{ id: 'channel', methods: { thumbnail: method } }],
      projects: [{ id: 'project' }],
      executions: [execution],
      orchestrators: [],
      libraryItems: [],
      libraryCollections: [],
    };
    const db: any = {
      channels: [],
      projects: [],
      executions: [],
      orchestrators: [],
      libraryItems: [],
      libraryCollections: [],
      ready: false,
    };
    let emitted = 0;
    const context: any = vm.createContext({
      db,
      serverRevision: -1,
      stateRequest: undefined,
      connectionError: undefined,
      emit: () => { emitted++; },
      normalizeChannel: (x: any) => x,
      normalizeExecutionDeliveries: (x: any) => x,
      readApiError: async () => 'error',
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => structuredClone(serverState),
      }),
      AbortSignal: { timeout: () => undefined },
    });
    vm.runInContext(normalizeExecutionCode, context);
    vm.runInContext(applyStateCode, context);
    vm.runInContext(refreshStateCode, context);

    await context.refreshState(true);
    assert.equal(db.ready, true);
    assert.equal(db.executions.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(db.executions[0].blocks[0])), execution.blocks[0]);
    assert.deepEqual(JSON.parse(JSON.stringify(db.executions[0].blocks[1])), execution.blocks[1]);
    assert.equal(db.executions[0].blocks[2].attempt, 3);
    assert.equal(db.executions[0].status, status);
    assert.deepEqual(JSON.parse(JSON.stringify(db.executions[0].methodSnapshot)), execution.methodSnapshot);
    assert.ok(emitted >= 1);
  }
});

test('reconcileEntities preserves object identity when incoming payload matches previous', () => {
  const context: any = vm.createContext({});
  vm.runInContext(applyStateCode, context);
  const current = [{ id: 'a', val: 1 }, { id: 'b', val: 2 }];
  const incoming = [{ id: 'a', val: 1 }, { id: 'b', val: 3 }];
  const reconciled = context.reconcileEntities(current, incoming);
  assert.strictEqual(reconciled[0], current[0]);
  assert.notStrictEqual(reconciled[1], current[1]);
  assert.equal(reconciled[1].val, 3);
});
