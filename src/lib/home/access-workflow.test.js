import {test,expect} from 'vitest';import {rmSync} from 'node:fs';
import {fixture,owner,member} from './admission-test-fixture.js';
import {buildJoinReview,joinIntentID,joinContentDigest} from './joining.js';
import {runAccessWorkflow} from '../../../scripts/access-workflow.mjs';
async function setup(){
 const f=await fixture();const config={homes:[{homeId:'example',ownerUserId:owner,root:'/Example/twin',stateDirectory:f.dir}]};
 const code=f.packet.reviewId+'-'+f.packet.reviewDigest;
 /** @type {any} */const c={principal:async()=>owner,file:async(/** @type {string} */path,/** @type {string} */account)=>path===f.packet.requestPath?{text:f.current().rawRequest,id:'request'}:path===f.packet.reviewPath?{text:f.current().rawReview,id:'review'}:path==='/Example/twin/home.json'?{text:f.current().rawHome,id:f.current().fileVersion}:f.files.has(path)?{text:f.files.get(path),id:'saved'}:null,
 write:async(/** @type {string} */p,/** @type {string} */text)=>f.files.set(p,text),listShares:f.t.listShares,createShare:f.t.createShare};
 return {f,config,code,c};
}
test('dashboard owner application runs admission and returns recipient-readable outcome, retry creates neither share twice',async()=>{
 const {f,config,code,c}=await setup();try{
  const input={homeId:'example',ownerUserId:owner,action:'apply',token:'caller-token',reviewCode:code};
  const result=await runAccessWorkflow(config,input,{client:c,admissionTransport:f.t});
  expect(result.recipientUserId).toBe(member);expect(f.shares).toHaveLength(2);const outcome=[...f.files.entries()].find(([p])=>p.includes('/join-status/'));if(!outcome)throw Error("Outcome missing");expect(JSON.parse(outcome[1]??"null").decision).toBe('approve');expect(outcome[1]).not.toContain('privateNote');
  await runAccessWorkflow(config,input,{client:c,admissionTransport:f.t});expect(f.shares).toHaveLength(2);
 }finally{rmSync(f.dir,{recursive:true});}
});
test('foreign caller and unconfigured home cannot execute admission',async()=>{
 const {f,config,code,c}=await setup();try{c.principal=async()=>member;await expect(runAccessWorkflow(config,{homeId:'example',ownerUserId:owner,action:'apply',reviewCode:code},{client:c,admissionTransport:f.t})).rejects.toThrow(/owner/);await expect(runAccessWorkflow(config,{homeId:'other',ownerUserId:owner,action:'request'},{client:c})).rejects.toThrow(/Configured/);expect(f.calls).toEqual([]);}finally{rmSync(f.dir,{recursive:true});}
});
test('a pending approval cannot be replaced by a conflicting rejection or unrelated fresh operation',async()=>{
 const {f,config,code,c}=await setup();f.t.createShare=async()=>{throw Error('lost');};try{
  await expect(runAccessWorkflow(config,{homeId:'example',ownerUserId:owner,action:'apply',reviewCode:code},{client:c,admissionTransport:f.t})).rejects.toThrow(/uncertain/);expect(f.shares).toEqual([]);
  const current=f.current();const context={homeId:'example',ownerUserId:owner,userId:owner,homeRevision:current.home.revision,homeFileVersion:current.fileVersion,homeDigest:await joinContentDigest(current.rawHome),requestDigest:f.packet.requestDigest,publicationDigest:f.packet.publicationDigest};
  const reject=buildJoinReview(current.request,{id:current.review.id,decision:'reject'},context,'2026-10-11T19:00:00.000Z');reject.id=await joinIntentID(reject);
  const rejectCode=reject.id+'-'+await joinContentDigest(JSON.stringify(reject));f.files.set('/Example/twin/join-decisions/'+rejectCode+'.json',JSON.stringify(reject));
  await expect(runAccessWorkflow(config,{homeId:'example',ownerUserId:owner,action:'apply',reviewCode:rejectCode},{client:c,admissionTransport:f.t})).rejects.toThrow(/pending admission/);
  expect([...f.files.keys()].some(p=>p.includes('/join-status/'))).toBe(false);expect(f.shares).toEqual([]);
 }finally{rmSync(f.dir,{recursive:true});}
});
test('app and persistent service owner mismatch is denied before applicant request sharing',async()=>{
 const {f,config,c}=await setup();c.principal=async()=>member;try{
  await expect(runAccessWorkflow(config,{homeId:'example',ownerUserId:member,action:'request'},{client:c})).rejects.toThrow(/owner configuration/);expect(f.shares).toEqual([]);expect(f.calls).toEqual([]);
 }finally{rmSync(f.dir,{recursive:true});}
});
