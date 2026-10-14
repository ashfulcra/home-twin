import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
/** @param {number} status */
function controller(status) {
  const source = readFileSync(new URL('../components/HomeChat.svelte', import.meta.url), 'utf8')
    .split('<script lang="ts">')[1]
    .split('</script>')[0];
  const parsed = ts.createSourceFile('chat.ts', source, ts.ScriptTarget.Latest, true);
  const node = parsed.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === 'response'
  );
  if (!node) throw new Error('Actual response function missing');
  const fn = node.getText(parsed);
  const script = `let errorMessage='',available=true,turns=[1],events=[1],recordActions=[1],modelReviews=[1],canReviewModel=true,canApplyModel=true,canSaveRecords=true,conversationId='first',callerId='caller';const home={id:'example'},reader={generation:1,select(){this.generation++}},start=()=>{};let release;const fetch=()=>new Promise(r=>release=r);${fn};return {request:()=>response('/api/home/chat/events'),finish(){release({ok:false,status,json:async()=>({message:'Synthetic auth error'})})},change(){reader.generation++;conversationId='new'},state:()=>({errorMessage,available,turns,events,modelReviews,canApplyModel})}`;
  return new Function(
    'status',
    ts.transpileModule(script, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
    }).outputText
  )(status);
}
test('expired session clears private chat and directs sign-in instead of model configuration', async () => {
  const c = controller(401),
    p = c.request();
  c.finish();
  await expect(p).rejects.toThrow();
  expect(c.state().turns).toEqual([]);
  expect(c.state().canApplyModel).toBe(false);
  expect(c.state().errorMessage).toMatch(/sign in/i);
});
test('revoked read access clears private chat and describes changed access', async () => {
  const c = controller(403),
    p = c.request();
  c.finish();
  await expect(p).rejects.toThrow();
  expect(c.state().modelReviews).toEqual([]);
  expect(c.state().errorMessage).toMatch(/access/i);
});
test('late auth failure from an old conversation cannot clear the new context', async () => {
  const c = controller(401),
    p = c.request();
  c.change();
  c.finish();
  await expect(p).rejects.toThrow();
  expect(c.state().turns).toEqual([1]);
  expect(c.state().available).toBe(true);
  expect(c.state().errorMessage).toBe('');
});
