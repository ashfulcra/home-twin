import {describe,it,expect} from 'vitest';
import {buildHouseholdRefresh,validateRefreshShares} from './household-refresh.js';
import {runHouseholdRefresh} from '../../../scripts/household-refresh-journal.mjs';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,rmdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const owner='11111111-1111-4111-8111-111111111111', member='22222222-2222-4222-8222-222222222222';
async function fixture(){
 const home={schemaVersion:1,id:'example',name:'Example',ownerUserId:owner,revision:6,members:[{userId:member,role:'contributor'}],notes:[{id:'note',text:'New household fact'}],privateNote:'never export'};
 const context={userId:owner,root:'/Example/twin',fileVersion:'v6',rawHome:JSON.stringify(home)};
 const packet=await buildHouseholdRefresh(home,context), input={principalId:owner,home,rawHome:context.rawHome,fileVersion:'v6'};
 const shares=[{datashare_id:'grant-1',datashare_name:'home-twin:example:review',sharing_fulcra_userid:owner,share_all_data:false,time_start:null,time_end:null,fulcra_data_types:['file:'+packet.publicationPath],permissions:[{allowed_fulcra_userid:member}],group_permissions:[]}];
 const prior=JSON.stringify({...packet.publication,revision:5,notes:[]}), files=new Map([[packet.publicationPath,prior],[context.root+'/home.json',context.rawHome]]);
 /** @type {string[]} */
 const calls=[];
 /** @type {{readInputs:()=>Promise<any>,readFile:(p:string)=>Promise<string|null>,listShares:()=>Promise<any[]>,writeFile:(p:string,text:string,before:()=>Promise<void>)=>Promise<void>}} */
 const transport={readInputs:async()=>input,readFile:async p=>files.get(p)??null,listShares:async()=>shares,writeFile:async(p,text,before)=>{await before();calls.push(p);files.set(p,text);}};
 const dir=mkdtempSync(join(tmpdir(),'home-refresh-'));writeFileSync(join(dir,'checkpoint.json'),JSON.stringify({schema:'home-twin-checkpoint/1',homeId:home.id,principalId:owner,root:context.root}),{mode:0o600});
 return {packet,input,shares,files,calls,transport,dir,prior,consent:{ownerApproved:true,publicationDigest:packet.publicationDigest,membersDigest:packet.membersDigest}};
}
describe('curated household refresh',()=>{
 it('keeps canonical bytes private, preserves prior publication and updates only curated file without grants',async()=>{
  const f=await fixture();await runHouseholdRefresh(f.dir,f.packet,f.transport,f.consent);
  expect(f.files.get('/Example/twin/home.json')).toBe(f.input.rawHome);expect(f.calls.some(p=>p==='/Example/twin/home.json')).toBe(false);
  expect(JSON.parse(f.files.get(f.packet.publicationPath)??'null')).not.toHaveProperty('privateNote');expect([...f.files.values()]).toContain(f.prior);
  const count=f.calls.length;const result=await runHouseholdRefresh(f.dir,f.packet,f.transport,f.consent);expect(f.calls).toHaveLength(count);expect(result.memberAccessVerified).toBe(false);
 });
 it('requires exact consent and rejects canonical drift before any write',async()=>{
  const f=await fixture();await expect(runHouseholdRefresh(f.dir,f.packet,f.transport,{})).rejects.toThrow(/consent|approval/i);
  f.input.fileVersion='v7';await expect(runHouseholdRefresh(f.dir,f.packet,f.transport,f.consent)).rejects.toThrow(/baseline/i);expect(f.calls).toHaveLength(0);
 });
 it('holds broad, foreign, group, revoked and unknown outgoing access before writes',async()=>{
  for(const patch of [{share_all_data:true},{fulcra_data_types:['file:/shared/home-twin/example/']},{permissions:[{allowed_fulcra_userid:owner}]},{group_permissions:[{id:'unknown'}]},{time_end:'2026-01-01'},{share_all_data:undefined}]){
   const f=await fixture();Object.assign(f.shares[0],patch);await expect(runHouseholdRefresh(f.dir,f.packet,f.transport,f.consent)).rejects.toThrow();expect(f.calls).toHaveLength(0);
  }
  const f=await fixture();f.shares.length=0;expect(()=>validateRefreshShares(f.shares,f.packet)).toThrow(/grant|access/i);
 });
 it('resolves a lost commit response by exact readback without another write',async()=>{
  const f=await fixture(), write=f.transport.writeFile;f.transport.writeFile=async(...args)=>{await write(...args);if(args[0]===f.packet.publicationPath)throw Error('response lost');};
  await runHouseholdRefresh(f.dir,f.packet,f.transport,f.consent);expect(f.calls.filter(p=>p===f.packet.publicationPath)).toHaveLength(1);
 });
 it('never blindly repeats an invisible uncertain commit',async()=>{
  const f=await fixture(), write=f.transport.writeFile;f.transport.writeFile=async(p,text,before)=>{if(p!==f.packet.publicationPath)return write(p,text,before);await before();f.calls.push(p);throw Error('possibly accepted');};
  await expect(runHouseholdRefresh(f.dir,f.packet,f.transport,f.consent)).rejects.toThrow(/uncertain/i);
  await expect(runHouseholdRefresh(f.dir,f.packet,f.transport,f.consent)).rejects.toThrow(/uncertain/i);expect(f.calls.filter(p=>p===f.packet.publicationPath)).toHaveLength(1);
 });
 it('holds pending admission/publication and occupied lock; does not bypass state',async()=>{
  for(const name of ['admission.json','publication.json']){const f=await fixture();writeFileSync(join(f.dir,name),JSON.stringify({status:'pending'}),{mode:0o600});await expect(runHouseholdRefresh(f.dir,f.packet,f.transport,f.consent)).rejects.toThrow(/pending|scope/i);expect(f.calls).toHaveLength(0);}
  const f=await fixture();mkdirSync(join(f.dir,'.cycle.lock'));await expect(runHouseholdRefresh(f.dir,f.packet,f.transport,f.consent)).rejects.toThrow(/lock/i);
 });
 it('stops before shared commit if membership/share scope changes after preserving prior bytes',async()=>{
  const f=await fixture(), write=f.transport.writeFile;f.transport.writeFile=async(...args)=>{await write(...args);if(args[0].includes('/history/'))f.shares[0].permissions[0].allowed_fulcra_userid=owner;};
  await expect(runHouseholdRefresh(f.dir,f.packet,f.transport,f.consent)).rejects.toThrow();expect(f.calls).not.toContain(f.packet.publicationPath);
 });
 it('requires current approved members, coherent raw baseline, and a distinct private canonical root',async()=>{
  const f=await fixture();await expect(buildHouseholdRefresh({...f.input.home,members:[]},{userId:owner,root:'/Example/twin',fileVersion:'v6',rawHome:JSON.stringify({...f.input.home,members:[]})})).rejects.toThrow(/member/i);
  await expect(buildHouseholdRefresh(f.input.home,{userId:owner,root:'/shared/home-twin/example',fileVersion:'v6',rawHome:f.input.rawHome})).rejects.toThrow(/distinct|private/i);
 });
});

it('a killed process preserves a live lock and durable in-flight refresh; inspected recovery cannot replay it',async()=>{
 const f=await fixture();
 const script=`import {runHouseholdRefresh} from './scripts/household-refresh-journal.mjs';const data=JSON.parse(process.argv[1]);const t={readInputs:async()=>data.input,listShares:async()=>data.shares,readFile:async p=>p===data.packet.publicationPath?data.prior:null,writeFile:async()=>{process.kill(process.pid,'SIGKILL');}};await runHouseholdRefresh(data.dir,data.packet,t,data.consent);`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',script,JSON.stringify({dir:f.dir,packet:f.packet,input:f.input,shares:f.shares,prior:f.prior,consent:f.consent})]);
 expect(child.signal).toBe('SIGKILL');await expect(runHouseholdRefresh(f.dir,f.packet,f.transport,f.consent)).rejects.toThrow(/lock/i);
 const pointer=JSON.parse(readFileSync(join(f.dir,'household-refresh.json'),'utf8'));expect(pointer.operations.backup).toBe('in-flight');
 // Only a dead synthetic subprocess's test lock is removed after inspection.
 rmdirSync(join(f.dir,'.cycle.lock'));await expect(runHouseholdRefresh(f.dir,f.packet,f.transport,f.consent)).rejects.toThrow(/uncertain/i);expect(f.calls).toEqual([]);
});
it('corrupt confirmed journal cannot authorize later work, and a current publication writes nothing',async()=>{
 const f=await fixture();await runHouseholdRefresh(f.dir,f.packet,f.transport,f.consent);const path=join(f.dir,'household-refresh.json'),pointer=JSON.parse(readFileSync(path,'utf8'));pointer.operations.publication='in-flight';writeFileSync(path,JSON.stringify(pointer),{mode:0o600});const count=f.calls.length;await expect(runHouseholdRefresh(f.dir,f.packet,f.transport,f.consent)).rejects.toThrow(/integrity/i);expect(f.calls).toHaveLength(count);
 const g=await fixture();g.files.set(g.packet.publicationPath,JSON.stringify(g.packet.publication));expect((await runHouseholdRefresh(g.dir,g.packet,g.transport,g.consent)).noChange).toBe(true);expect(g.calls).toEqual([]);
});
it('holds newer, malformed or divergent same-revision publication instead of silently rolling back',async()=>{for(const revision of [7,undefined,-1,6]){const f=await fixture();f.files.set(f.packet.publicationPath,JSON.stringify({...f.packet.publication,revision,notes:[{id:'prior',text:'Another published record'}]}));await expect(runHouseholdRefresh(f.dir,f.packet,f.transport,f.consent)).rejects.toThrow(/revision|diverg/i);expect(f.calls).toEqual([]);}});
