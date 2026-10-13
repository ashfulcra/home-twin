import {test,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readdirSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {runOwnerJoinInbox} from '../../../scripts/owner-join-inbox.mjs';
const owner='11111111-1111-4111-8111-111111111111';
function fixture(){const dir=mkdtempSync(join(tmpdir(),'home-joins-'));const scope={homeId:'example',root:'/Example/twin',principalId:owner};writeFileSync(join(dir,'checkpoint.json'),JSON.stringify({schema:'home-twin-checkpoint/1',...scope}),{mode:0o600});let reads=0;const access={deployment:{homeId:scope.homeId,ownerUserId:owner},ownerUserId:owner,userId:owner,role:'maintainer',root:scope.root,home:{id:scope.homeId,ownerUserId:owner,revision:1},file:{id:'v1',text:'same'}};const client={readAccess:async()=>access,inbox:{incoming:async()=>{reads++;return [];},readRequest:async()=>{throw Error('not permitted');},decisions:async()=>{throw Error('not needed');}}};return {dir,scope,access,client,getReads:()=>reads,clean:()=>rmSync(dir,{recursive:true,force:true})};}
test('existing scoped owner journal keeps reports private and suppresses identical checks',async()=>{const f=fixture();try{const one=await runOwnerJoinInbox(f.dir,f.scope,f.client);expect(one.changed).toBe(true);expect(one.inbox.attentionCount).toBe(0);expect(one.remoteWrites).toBe(false);expect(await runOwnerJoinInbox(f.dir,f.scope,f.client)).toMatchObject({changed:false,reportPath:one.reportPath});expect(JSON.parse(readFileSync(one.reportPath,'utf8')).scope).toEqual(f.scope);}finally{f.clean();}});
test('wrong principal/home state and occupied lock deny before reading requests',async()=>{for(const issue of ['scope','lock','missing']){const f=fixture();try{if(issue==='scope')f.access.userId='22222222-2222-4222-8222-222222222222';if(issue==='lock')mkdirSync(join(f.dir,'.cycle.lock'));if(issue==='missing')rmSync(join(f.dir,'checkpoint.json'));await expect(runOwnerJoinInbox(f.dir,f.scope,f.client)).rejects.toThrow(/scope|owner|lock|checkpoint/i);expect(f.getReads()).toBe(0);}finally{f.clean();}}});
test('outage or canonical changes do not replace prior confirmed report',async()=>{const f=fixture();try{const one=await runOwnerJoinInbox(f.dir,f.scope,f.client);const before=readFileSync(join(f.dir,'join-inbox.json'));f.client.inbox.incoming=async()=>{throw Error('403 unavailable');};await expect(runOwnerJoinInbox(f.dir,f.scope,f.client)).rejects.toThrow(/403|unavailable/i);expect(readFileSync(join(f.dir,'join-inbox.json'))).toEqual(before);f.client.inbox.incoming=async()=>[];let n=0;f.client.readAccess=async()=>++n===1?f.access:{...f.access,file:{...f.access.file,id:'v2'}};await expect(runOwnerJoinInbox(f.dir,f.scope,f.client)).rejects.toThrow(/changed/i);expect(readFileSync(join(f.dir,'join-inbox.json'))).toEqual(before);expect(JSON.parse(readFileSync(one.reportPath,'utf8')).remoteWrites).toBe(false);}finally{f.clean();}});
test('corrupt retained report is a hold rather than silent replacement',async()=>{const f=fixture();try{const one=await runOwnerJoinInbox(f.dir,f.scope,f.client);writeFileSync(one.reportPath,'{}',{mode:0o600});await expect(runOwnerJoinInbox(f.dir,f.scope,f.client)).rejects.toThrow(/integrity|report/i);}finally{f.clean();}});
test('unsafe checkpoint permissions and symlinked reports hold without replacing originals',async()=>{const f=fixture();try{const {chmodSync,symlinkSync}=await import('node:fs');chmodSync(join(f.dir,'checkpoint.json'),0o644);await expect(runOwnerJoinInbox(f.dir,f.scope,f.client)).rejects.toThrow(/private/i);expect(f.getReads()).toBe(0);chmodSync(join(f.dir,'checkpoint.json'),0o600);const one=await runOwnerJoinInbox(f.dir,f.scope,f.client);const saved=readFileSync(one.reportPath);rmSync(one.reportPath);writeFileSync(join(f.dir,'retained.json'),saved,{mode:0o600});symlinkSync(join(f.dir,'retained.json'),one.reportPath);await expect(runOwnerJoinInbox(f.dir,f.scope,f.client)).rejects.toThrow(/private|symlink/i);expect(readFileSync(join(f.dir,'retained.json'))).toEqual(saved);}finally{f.clean();}});
test('a retained report can recover a missing inbox checkpoint while preserving original observation time',async()=>{const f=fixture();try{const one=await runOwnerJoinInbox(f.dir,f.scope,f.client);const prior=readFileSync(one.reportPath);rmSync(join(f.dir,'join-inbox.json'));const next=await runOwnerJoinInbox(f.dir,f.scope,f.client);expect(next).toMatchObject({changed:true,reportId:one.reportId,reportPath:one.reportPath});expect(readFileSync(one.reportPath)).toEqual(prior);expect((await runOwnerJoinInbox(f.dir,f.scope,f.client)).changed).toBe(false);}finally{f.clean();}});


test('identical authenticated inbox inspection retains a distinct receipt and original reports/checkpoints',async()=>{
 const f=fixture();try{
  const one=await runOwnerJoinInbox(f.dir,f.scope,f.client);expect(one.invocationPath).toEqual(expect.any(String));
  const report=readFileSync(one.reportPath);const checkpoint=readFileSync(join(f.dir,'join-inbox.json'));const maintainer=readFileSync(join(f.dir,'checkpoint.json'));
  const two=await runOwnerJoinInbox(f.dir,f.scope,f.client);expect(two.changed).toBe(false);expect(two.invocationPath).not.toBe(one.invocationPath);
  const receipt=JSON.parse(readFileSync(two.invocationPath,'utf8'));expect(receipt).toMatchObject({kind:'owner-join-inbox',scope:f.scope,reportId:one.reportId,remoteWrites:false,summary:{attentionCount:0,unavailableCount:0,unsupportedCount:0,more:false,reviewIncomplete:false}});
  expect(Number.isFinite(Date.parse(receipt.observedAt))).toBe(true);expect(statSync(two.invocationPath).mode&0o077).toBe(0);
  expect(readFileSync(one.reportPath)).toEqual(report);expect(readFileSync(join(f.dir,'join-inbox.json'))).toEqual(checkpoint);expect(readFileSync(join(f.dir,'checkpoint.json'))).toEqual(maintainer);
 }finally{f.clean();}
});
test('failed owner inbox reads never add a successful receipt',async()=>{
 const f=fixture();try{
  await runOwnerJoinInbox(f.dir,f.scope,f.client);const before=readdirSync(join(f.dir,'inspection-receipts'));
  f.client.inbox.incoming=async()=>{throw Error('403 unavailable');};await expect(runOwnerJoinInbox(f.dir,f.scope,f.client)).rejects.toThrow('unavailable');expect(readdirSync(join(f.dir,'inspection-receipts'))).toEqual(before);
 }finally{f.clean();}
});

test('partial owner discovery remains explicit in its persistence receipt',async()=>{
 const f=fixture();try{
  Object.assign(f.client.inbox,{incoming:async()=>[{fulcra_data_types:['file:/shared/home-twin/example/join-requests/']}]});
  const result=await runOwnerJoinInbox(f.dir,f.scope,f.client);const receipt=JSON.parse(readFileSync(result.invocationPath,'utf8'));
  expect(result.inbox.unsupportedCount).toBe(1);expect(receipt.summary.unsupportedCount).toBe(1);expect(receipt.remoteWrites).toBe(false);
 }finally{f.clean();}
});
