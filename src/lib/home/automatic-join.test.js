import {test,expect} from 'vitest';
import {mkdtempSync,chmodSync,readFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {runAutomaticJoin} from '../../../scripts/automatic-join.mjs';
const owner='11111111-1111-4111-8111-111111111111',member='22222222-2222-4222-8222-222222222222';
const target={homeId:'example',ownerUserId:owner};
function setup(){const dir=mkdtempSync(join(tmpdir(),'auto-join-'));chmodSync(dir,0o700);const files=new Map();
 /** @type {any[]} */
 const shares=[];let creates=0;
 /** @type {any} */const t={principal:async()=>member,requests:async()=>[],readFile:async (/** @type {string} */p)=>files.get(p)??null,writeFile:async(/** @type {string} */p,/** @type {string} */v)=>files.set(p,v),listShares:async()=>shares,createShare:async (/** @type {any} */b)=>{creates++;const {fulcra_user_name,...scope}=b;shares.push({...scope,sharing_fulcra_userid:fulcra_user_name,sharing_fulcra_user_name:'Example Requester',datashare_id:'44444444-4444-4444-8444-444444444444'});}};
 return {dir,t,files,shares,creates:()=>creates};
}
test('login persists and shares one exact own request, repeat reuses its original time and identity',async()=>{
 const f=setup();try{const a=await runAutomaticJoin(f.dir,target,f.t),b=await runAutomaticJoin(f.dir,target,f.t);expect(a.status).toBe('pending-approval');expect(b).toEqual(a);expect(f.files.size).toBe(1);expect(f.creates()).toBe(1);expect(f.shares[0].fulcra_data_types).toEqual(['file:'+a.requestPath]);expect(f.shares[0].permissions).toEqual([{allowed_fulcra_userid:owner}]);expect(f.shares[0].share_all_data).toBe(false);expect(JSON.stringify(a)).not.toContain('prompt');}finally{rmSync(f.dir,{recursive:true});}
});
test('lost grant response remains held on retry until exact outgoing readback; no blind duplicate',async()=>{
 const f=setup();let attempts=0;f.t.createShare=async()=>{attempts++;throw Error('lost');};
 try{await expect(runAutomaticJoin(f.dir,target,f.t)).rejects.toThrow(/uncertain/);await expect(runAutomaticJoin(f.dir,target,f.t)).rejects.toThrow(/uncertain/);expect(attempts).toBe(1);}finally{rmSync(f.dir,{recursive:true});}
});
test('uncertain saved request resumes by exact bytes without another upload',async()=>{
 const f=setup();let visible=false,writes=0;f.t.writeFile=async(/** @type {string} */p,/** @type {string} */v)=>{writes++;f.files.set(p,v);};f.t.readFile=async (/** @type {string} */p)=>visible?f.files.get(p)??null:null;
 try{await expect(runAutomaticJoin(f.dir,target,f.t)).rejects.toThrow(/uncertain/);await expect(runAutomaticJoin(f.dir,target,f.t)).rejects.toThrow(/uncertain/);expect(writes).toBe(1);visible=true;expect((await runAutomaticJoin(f.dir,target,f.t)).status).toBe('pending-approval');expect(writes).toBe(1);}finally{rmSync(f.dir,{recursive:true});}
});
test('existing manual request is reused rather than making an extra inbox row',async()=>{
 const f=setup();try{const a=await runAutomaticJoin(f.dir,target,f.t);const record=JSON.parse(f.files.get(a.requestPath));const next=setup();try{next.files.set(a.requestPath,JSON.stringify(record));next.t.requests=async()=>[record];expect((await runAutomaticJoin(next.dir,target,next.t)).code).toBe(a.code);expect(next.files.size).toBe(1);}finally{rmSync(next.dir,{recursive:true});}}finally{rmSync(f.dir,{recursive:true});}
});
test('owner self request and foreign home state fail before any upload or share',async()=>{
 const f=setup();try{f.t.principal=async()=>owner;await expect(runAutomaticJoin(f.dir,target,f.t)).rejects.toThrow(/owner/);expect(f.files.size).toBe(0);expect(f.creates()).toBe(0);f.t.principal=async()=>member;await runAutomaticJoin(f.dir,target,f.t);await expect(runAutomaticJoin(f.dir,{...target,homeId:'other'},f.t)).rejects.toThrow(/scope/);}finally{rmSync(f.dir,{recursive:true});}
});

test('confirmed real-shaped receipt recovers an in-flight grant without sending a second request or share',async()=>{
 const f=setup();const list=f.t.listShares;let visible=false;f.t.listShares=async()=>visible?list():[];
 try{await expect(runAutomaticJoin(f.dir,target,f.t)).rejects.toThrow(/uncertain/);expect(f.creates()).toBe(1);visible=true;const result=await runAutomaticJoin(f.dir,target,f.t);expect(result.status).toBe('pending-approval');expect(f.creates()).toBe(1);expect(f.files.size).toBe(1);}finally{rmSync(f.dir,{recursive:true});}
});
