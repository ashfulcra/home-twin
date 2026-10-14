import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as stateHelpers from '../home/chat-model-state.js';
// Execute the actual component controller functions; only the remote status boundary is synthetic.
/** @param {any[]} refs */
function controller(refs) {
  const source = readFileSync(new URL('../components/HomeChat.svelte', import.meta.url), 'utf8')
    .split('<script lang="ts">')[1]
    .split('</script>')[0];
  const parsed = ts.createSourceFile('chat.ts', source, ts.ScriptTarget.Latest, true);
  const functions = parsed.statements
    .filter(
      (n) =>
        ts.isFunctionDeclaration(n) &&
        ['pollModelProgress', 'modelResult'].includes(n.name?.text ?? '')
    )
    .map((n) => n.getText(parsed))
    .join('\n');
  const script = `const {modelOperationActive,mergeModelProgress,mergeModelReviews,modelProgressComplete}=helpers; let conversationId=refs[0].conversationId, modelReviews=[],modelRefs=refs,modelPoll=null,canApplyModel=true,disposed=false,errorMessage='';const reader={generation:1};const modelDone=new Set();let polls=0, active=false;const modelClient=async(ref,op)=>{polls++;return {...ref,operation:{active},status:op==='undo-status'?'undo-preview-ready':'model-applied'}};${functions}; return {setActive(value){active=value},poll:pollModelProgress,lose(){modelReviews=[]},restore(rows){modelReviews=mergeModelReviews(modelReviews,rows,conversationId)},reviews(){return modelReviews},polls(){return polls}}`;
  return new Function(
    'helpers',
    'refs',
    ts.transpileModule(script, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
    }).outputText
  )(stateHelpers, refs);
}
const review = {
  conversationId: '11111111-1111-4111-8111-111111111111',
  actionId: '22222222-2222-4222-8222-222222222222',
  digest: 'a'.repeat(64)
};
test('restored reviews recheck historical saved progress after access temporarily hid the cards', async () => {
  const c = controller([{ ...review, kind: 'apply' }]);
  c.restore([review]);
  await c.poll();
  expect(c.reviews()[0].progress.status).toBe('model-applied');
  await c.poll();
  expect(c.polls()).toBe(1);
  c.lose();
  c.restore([review]);
  await c.poll();
  expect(c.polls()).toBe(2);
  expect(c.reviews()[0].progress.status).toBe('model-applied');
});
test('status received before its card returns is polled again rather than permanently dropped', async () => {
  const c = controller([{ ...review, kind: 'apply' }]);
  await c.poll();
  expect(c.reviews()).toEqual([]);
  c.restore([review]);
  await c.poll();
  expect(c.reviews()[0]?.progress?.status).toBe('model-applied');
});
test('restored Undo progress does not repeat status calls while its exact result is retained', async () => {
  const c = controller([{ ...review, kind: 'undo' }]);
  c.restore([review]);
  await c.poll();
  await c.poll();
  expect(c.polls()).toBe(1);
  c.lose();
  c.restore([review]);
  await c.poll();
  expect(c.polls()).toBe(2);
  expect(c.reviews()[0].undo.status).toBe('undo-preview-ready');
});

test('terminal Undo status stays polled until its running flag clears', async () => {
  const c = controller([{ ...review, kind: 'undo' }]);
  c.restore([review]);
  c.setActive(true);
  await c.poll();
  expect(c.reviews()[0].undo.operation.active).toBe(true);
  c.setActive(false);
  await c.poll();
  expect(c.polls()).toBe(2);
  expect(c.reviews()[0].undo.operation.active).toBe(false);
});
