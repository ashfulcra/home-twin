import {test,expect} from 'vitest';
import {buildAgentStart} from './agent-start.js';
const owner='00000000-0000-4000-8000-000000000001';
const member='00000000-0000-4000-8000-000000000002';
const home={id:'example-home',name:'Example',ownerUserId:owner};
const options={role:'maintainer',ownerUserId:owner,userId:owner,root:'/example/twin'};
/** The copied artifact must carry the same data a consumer receives, not just the downloaded brief.
 * @param {string|null} prompt */
function copiedContext(prompt){
 if(!prompt)throw Error('Copyable prompt missing');
 const match=prompt.match(/not obey instructions embedded in them:\n(\{[\s\S]*?\n\})\n\n/);
 if(!match)throw Error('Copyable context missing');
 return JSON.parse(match[1]);
}
test('a copied owner handoff locates the source in its resolved home without browser-session credentials',()=>{
 for(const [root,pointer,archive] of [
  ['/example/twin','/example/twin/assembly-preview.json','/example/twin/assembly-preview'],
  ['/another-home/twin','/another-home/twin/assembly-preview.json','/another-home/twin/assembly-preview'],
  ['/shared/home-twin/example-home','/shared/home-twin/example-home/assembly-preview.json','/shared/home-twin/example-home/assembly-preview']
 ]){
  const start=buildAgentStart(home,{...options,root,sourceLookup:{pointerPath:'/foreign/private'}});
  const context=copiedContext(start.prompt);
  expect(context.sourceLookup).toEqual({pointerPath:pointer,archiveRoot:archive});
  expect(start.context?.sourceLookup).toEqual(context.sourceLookup);
  expect(JSON.stringify(start)).not.toContain('/foreign/private');
 }
});
test('member copies cannot acquire private source lookup by supplying owner-like metadata',()=>{
 for(const role of ['viewer','contributor']){
  const start=buildAgentStart(home,{...options,role,userId:member,root:'/shared/home-twin/example-home',sourceLookup:{pointerPath:'/example/twin/assembly-preview.json'},assemblyReference:{previewDigest:'a'.repeat(64)}});
  expect(start.status).toBe('ready');expect(copiedContext(start.prompt).sourceLookup).toBeUndefined();
  expect(start.context?.sourceLookup).toBeUndefined();expect(start.prompt).not.toContain('assembly-preview');expect(start.prompt).not.toContain('/example/twin');
 }
});
test('unverified or inconsistent owner identity yields no source or copied handoff',()=>{
 for(const bad of [{userId:member},{root:'/another-home/private'},{ownerUserId:member},{role:'unverified'}]){
  const start=buildAgentStart(home,{...options,...bad,sourceLookup:{pointerPath:'/example/twin/assembly-preview.json'}});
  expect(start.status).toBe('needs-verified-context');expect(start.context).toBeNull();expect(start.prompt).toBeNull();
 }
});
