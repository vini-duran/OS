import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { attemptAfterRetryInvalidation } from '../src/lib/retry-attempt';

// Run the actual store functions with persistence/network replaced by fixtures.
// Importing store directly would auto-hydrate and couple tests to React/browser IO.
const source = fs.readFileSync(new URL('../src/lib/store.ts', import.meta.url), 'utf8');
function functionSource(start: string, end: string) {
  const offset = source.indexOf(start);
  assert(offset >= 0);
  return ts.transpileModule(source.slice(offset, source.indexOf(end, offset)), {
    compilerOptions: {target: ts.ScriptTarget.ES2022},
  }).outputText;
}
const syncCode = functionSource('function synchronizeOpenExecutionsWithMethod(', 'export function removeChannel');
const hydrateCode = functionSource('async function hydrate()', 'void hydrate();');
const method = {processType:'thumbnail', blocks:[
  {id:'generate',operator:'Código'}, {id:'select',operator:'Humano'}, {id:'promote',operator:'Código'},
]};
const fixture = () => ({id:'run',channelId:'channel',projectId:'project',processType:'thumbnail',status:'awaiting_human',
  methodSnapshot:structuredClone(method),blocks:[
    {blockId:'generate',status:'completed',attempt:2,values:{images:['a','b','c']}},
    {blockId:'select',status:'awaiting_human',attempt:2,values:{selected_values:['a','b','c']}},
    {blockId:'promote',status:'pending',attempt:3,values:{}},
  ]});

test('reload preserves a reserved retry, human decisions and failed state without writes', async () => {
  for (const status of ['awaiting_human','failed']) {
    const execution=fixture(); execution.status=status;
    const data:any = {'/api/channels':[{id:'channel',methods:{thumbnail:method}}],'/api/projects':[{id:'project'}],
      '/api/executions':[execution],'/api/library':[],'/api/library/collections':[],'/api/orchestrators':[]};
    const db:any={ready:false,channels:[],projects:[],executions:[],libraryItems:[],libraryCollections:[],orchestrators:[]};
    let syncs=0, refreshes=0;
    const context:any=vm.createContext({window:{},db,console,fetch:async(url:string)=>({ok:true,json:async()=>structuredClone(data[url])}),
      normalizeChannel:(x:any)=>x,normalizeExecution:(x:any)=>x,emit:()=>{},startGlobalOrchestratorRefresh:()=>{refreshes++;},
      PROCESS_ORDER:['thumbnail'],synchronizeOpenExecutionsWithMethod:()=>{syncs++;}});
    vm.runInContext(hydrateCode,context); await context.hydrate();
    assert.deepEqual(db.executions[0],execution); assert.equal(syncs,0); assert.equal(refreshes,1);
  }
});

function synchronize(execution:any, changedMethod:any) {
  const db={executions:[execution],projects:[]}; let writes=0;
  const context:any=vm.createContext({db,structuredClone,attemptAfterRetryInvalidation,persistProject:()=>{},persistExecution:()=>{writes++;}});
  vm.runInContext(syncCode,context);
  context.synchronizeOpenExecutionsWithMethod('channel','thumbnail',changedMethod);
  return writes;
}

test('saving an unchanged method does not reset states or attempts',()=>{
  const execution=fixture(),before=structuredClone(execution);
  assert.equal(synchronize(execution,structuredClone(method)),0);
  assert.deepEqual(execution,before);
});

test('method edit preserves reserved pending attempt and completed generation',()=>{
  const execution=fixture(),before=structuredClone(execution.blocks[0]);
  synchronize(execution,{...method,blocks:method.blocks.map(b=>({...b,name:'edited'}))});
  assert.equal(JSON.stringify(execution.blocks[0]),JSON.stringify(before));
  assert.equal(execution.blocks[2].attempt,3);
  assert.deepEqual(execution.blocks[1].values.selected_values,['a','b','c']);
});

test('invalidated previously executed downstream block receives a fresh identity',()=>{
  const execution=fixture();Object.assign(execution.blocks[2],{status:'failed',attempt:2});
  synchronize(execution,{...method,blocks:method.blocks.map(b=>({...b,name:'edited'}))});
  assert.equal(execution.blocks[2].attempt,3); assert.equal(execution.blocks[2].status,'pending');
});
