import {test,expect} from 'vitest';
import {applyReviewDecisions} from '../../../scripts/review-decisions.mjs';
import {reconcileContributions} from './contributions.js';
const h={schemaVersion:1,id:'example',name:'Example',revision:1,ownerUserId:'owner',equipment:[{id:'heat',model:'Old'}],notes:[],history:[]};
const c={id:'12345678-1234-4123-8123-123456789abc',homeId:'example',authorUserId:'member',recordedAt:'2026-10-09T12:00:00Z',kind:'fact',entityId:'heat',field:'model',value:'New',baseRevision:1};
const d={id:'22345678-1234-4123-8123-123456789abc',homeId:'example',baseRevision:1,contributionId:c.id,action:'accept-fact',priorValue:'Old',reason:'Label confirms model',sourceIds:['label-photo'],reviewerUserId:'owner',recordedAt:'2026-10-09T13:00:00Z',contribution:c};
test('recorded fact review prepares a new version preserving prior fact and original evidence',()=>{
 const r=applyReviewDecisions(h,[c],[d]);expect(r.home.equipment[0].model).toBe('New');expect(r.home.revision).toBe(2);expect(h.equipment[0].model).toBe('Old');
 expect(r.home.reviewDecisions[0].priorValue).toBe('Old');expect(r.home.reviewDecisions[0].contribution.authorUserId).toBe('member');
 expect(reconcileContributions(r.home,[c]).review).toHaveLength(0);
 expect(applyReviewDecisions(r.home,[c],[d]).home.revision).toBe(2);
});
test('rejecting a conflicting contribution hides it from review without erasing evidence',()=>{
 const r=applyReviewDecisions(h,[c],[{...d,action:'reject'}]);expect(r.home.equipment[0].model).toBe('Old');
 expect(reconcileContributions(r.home,[c]).review).toHaveLength(0);expect(r.home.reviewDecisions[0].contribution.value).toBe('New');
 expect(reconcileContributions(r.home,[{...c,value:'Changed'}]).review[0].reason).toBe('review-decision-mismatch');
});
test('stale, mismatched, unauthenticated or ambiguous decisions cannot alter a candidate',()=>{
 for(const bad of [{...d,baseRevision:0},{...d,priorValue:'Wrong'},{...d,reviewerUserId:'other'},{...d,contribution:{...c,value:'Wrong'}},{...d,action:'accept-geometry'}])expect(()=>applyReviewDecisions(h,[c],[bad])).toThrow();
 expect(()=>applyReviewDecisions(h,[c,{...c,value:'Other'}],[d])).toThrow();
 expect(()=>applyReviewDecisions(h,[c],[d,{...d,reason:'Changed'}])).toThrow();
});
test('key order does not turn an identical reviewed payload into a collision',()=>{
 const reordered=Object.fromEntries(Object.entries(c).reverse());const r=applyReviewDecisions(h,[c,reordered],[d]);
 expect(r.home.equipment[0].model).toBe('New');expect(reconcileContributions(r.home,[c,reordered]).review).toHaveLength(0);
});
test('revision overflow cannot produce an unversioned candidate',()=>{
 expect(()=>applyReviewDecisions({...h,revision:Number.MAX_SAFE_INTEGER},[{...c,baseRevision:Number.MAX_SAFE_INTEGER}],[{...d,baseRevision:Number.MAX_SAFE_INTEGER,contribution:{...c,baseRevision:Number.MAX_SAFE_INTEGER}}])).toThrow();
});
