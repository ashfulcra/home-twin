import {test,expect} from 'vitest';import {rmSync,mkdirSync,readFileSync} from 'node:fs';import {join} from 'node:path';
import {fixture,member} from './admission-test-fixture.js';
import {applyWebAdmission} from '../../../scripts/web-admission.mjs';
test('web approval applies scoped membership/publication/share using the existing maintainer state',async()=>{
 const f=await fixture();try{const reviewCode=f.packet.reviewId+'-'+f.packet.reviewDigest;const result=await applyWebAdmission(f.dir,reviewCode,async()=>f.packet,f.t);expect(result.status).toBe('outgoing-confirmed-member-unverified');expect(f.current().home.members).toEqual([{userId:member,role:'contributor'}]);expect(f.current().home.privateNote).toBe('keep private');expect(f.shares[0].fulcra_data_types).toEqual(['file:'+f.packet.publicationPath]);expect(JSON.parse(f.files.get(f.packet.publicationPath)??"null").privateNote).toBeUndefined();expect(f.calls.filter(c=>c[0]==='share')).toHaveLength(1);}finally{rmSync(f.dir,{recursive:true});}
});
test('after lost browser response the durable packet resumes despite changed canonical revision',async()=>{
 const f=await fixture();try{const code=f.packet.reviewId+'-'+f.packet.reviewDigest;await applyWebAdmission(f.dir,code,async()=>f.packet,f.t);const again=await applyWebAdmission(f.dir,code,async()=>{throw Error('Current revision differs');},f.t);expect(again.recipientUserId).toBe(member);expect(f.calls.filter(c=>c[0]==='share')).toHaveLength(1);}finally{rmSync(f.dir,{recursive:true});}
});
test('occupied maintainer lock refuses web mutation, unchanged journals and home',async()=>{
 const f=await fixture();try{mkdirSync(join(f.dir,'.cycle.lock'));await expect(applyWebAdmission(f.dir,f.packet.reviewId+'-'+f.packet.reviewDigest,async()=>f.packet,f.t)).rejects.toThrow(/lock/);expect(f.current().home.members).toEqual([]);expect(f.calls).toEqual([]);}finally{rmSync(f.dir,{recursive:true});}
});
test('unconfirmed grant stays recoverable and cannot be duplicated by web retry',async()=>{
 const f=await fixture();let calls=0;f.t.createShare=async()=>{calls++;throw Error('lost');};
 try{const code=f.packet.reviewId+'-'+f.packet.reviewDigest;await expect(applyWebAdmission(f.dir,code,async()=>f.packet,f.t)).rejects.toThrow(/uncertain/);await expect(applyWebAdmission(f.dir,code,async()=>{throw Error('must use saved packet');},f.t)).rejects.toThrow(/uncertain/);expect(calls).toBe(1);}finally{rmSync(f.dir,{recursive:true});}
});
test('malformed decision path cannot prepare or apply a packet',async()=>{
 const f=await fixture();try{await expect(applyWebAdmission(f.dir,'../home.json',async()=>f.packet,f.t)).rejects.toThrow(/code/);expect(f.calls).toEqual([]);}finally{rmSync(f.dir,{recursive:true});}
});
test('stale preflight before any immutable admission intent permits a fresh review, never reports approval',async()=>{
 const f=await fixture();try{
  f.change({fileVersion:'new-version'});const result=await applyWebAdmission(f.dir,f.packet.reviewId+'-'+f.packet.reviewDigest,async()=>f.packet,f.t);
  expect(result.status).toBe('review-required');expect(result.noAccessMutationStarted).toBe(true);expect(f.calls).toEqual([]);expect(f.shares).toEqual([]);
 }finally{rmSync(f.dir,{recursive:true});}
});
test('a simultaneous click cannot discard a decision whose first request is still preparing',async()=>{
 const f=await fixture();let release=()=>{},entered=()=>{};const paused=new Promise(r=>{release=()=>r(undefined);}),started=new Promise(r=>{entered=()=>r(undefined);});const code=f.packet.reviewId+'-'+f.packet.reviewDigest;
 const first=applyWebAdmission(f.dir,code,async()=>{entered();await paused;return f.packet;},f.t);
 try{await started;await expect(applyWebAdmission(f.dir,code,async()=>f.packet,f.t)).rejects.toThrow(/lock/);expect(f.calls).toEqual([]);release();expect((await first).status).toBe('outgoing-confirmed-member-unverified');}
 finally{release();await first.catch(()=>{});rmSync(f.dir,{recursive:true});}
});
