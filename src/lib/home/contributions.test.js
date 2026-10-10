import {describe,it,expect} from 'vitest';
import {reconcileContributions} from './contributions.js';
const home={id:'example',equipment:[{id:'heat',model:'Known model',facts:[]}],notes:[],history:[]};
const base={id:'a',homeId:'example',authorUserId:'member',recordedAt:'2026-10-09T12:00:00Z',entityId:'heat'};
describe('durable contributions',()=>{
 it('accepts a routine note once across retries without changing the input home',()=>{
  const c={...base,kind:'note',text:'Filter is in the utility room'};
  const result=reconcileContributions(home,[c,c]);
  expect(result.home.notes).toHaveLength(1);expect(result.accepted).toEqual(['a']);expect(home.notes).toEqual([]);
 });
 it('flags an existing fact contradiction and preserves the accepted value',()=>{
  const result=reconcileContributions(home,[{...base,kind:'fact',field:'model',value:'Different model'}]);
  expect(result.home.equipment[0].model).toBe('Known model');expect(result.review[0].reason).toBe('contradiction');
 });
 it('flags competing new facts without choosing the first contributor as winner',()=>{
  const result=reconcileContributions(home,[{...base,kind:'fact',field:'serial',value:'ABC'},{...base,id:'b',kind:'fact',field:'serial',value:'XYZ'}]);
  expect(result.home.equipment[0].serial).toBeUndefined();expect(result.review).toHaveLength(2);
 });
 it('accepts a missing routine fact with contributor provenance',()=>{
  const result=reconcileContributions(home,[{...base,kind:'fact',field:'serial',value:'ABC'}]);
  expect(result.home.equipment[0].serial).toBe('ABC');expect(result.home.contributionEvidence[0].authorUserId).toBe('member');
  expect(result.home.equipment[0].fieldEvidence.serial).toEqual([{contributionId:'a',authorUserId:'member',recordedAt:base.recordedAt,value:'ABC'}]);
 });
 it('holds geometry for review and isolates unrelated-home contributions',()=>{
  const result=reconcileContributions(home,[{...base,kind:'geometry',value:{wall:'move'}},{...base,id:'b',homeId:'unrelated',kind:'note',text:'Unrelated'}]);
  expect(result.review[0].reason).toBe('major-model-change');expect(result.home.notes).toHaveLength(0);expect(result.accepted).toEqual([]);
 });
 it('does not count a maintenance report without a valid performed date as completed service',()=>{
  const result=reconcileContributions(home,[{...base,kind:'maintenance',performedAt:'not-a-date',text:'Done'}]);
  expect(result.home.history).toHaveLength(0);expect(result.review[0].reason).toBe('missing-service-date');
 });
});

import { validateContribution } from './contributions.js';
it('input rejects paths and oversized notes; discards claimed authors',()=>{
 expect(()=>validateContribution({id:'../x',homeId:'h',kind:'note',text:'hello'})).toThrow();
 expect(()=>validateContribution({id:'12345678-1234-4123-8123-123456789abc',homeId:'h',kind:'note',text:'x'.repeat(10001)})).toThrow();
 const input=validateContribution({id:'12345678-1234-4123-8123-123456789abc',homeId:'h',kind:'note',text:'hello',authorUserId:'imposter'});
 expect(input.authorUserId).toBeUndefined();
});

it('holds facts based on an older snapshot but accepts independent notes',()=>{
 const h={...home,revision:2};
 const r=reconcileContributions(h,[{...base,baseRevision:1,kind:'fact',field:'serial',value:'A'},{...base,id:'b',baseRevision:1,kind:'note',text:'Routine note'}]);
 expect(r.review[0].reason).toBe('stale-base-revision');expect(r.accepted).toEqual(['b']);
});

it('holds forged future maintenance and ignores untrusted competing facts',()=>{
 const baseline={id:'h',revision:1,equipment:[{id:'e'}]};
 const result=reconcileContributions(baseline,[{id:'future',homeId:'h',kind:'maintenance',authorUserId:'a',entityId:'e',performedAt:'2099-01-01',recordedAt:'2099-01-02'},{id:'good',homeId:'h',kind:'fact',authorUserId:'a',entityId:'e',field:'serial',value:'123'},{id:'forged',homeId:'h',kind:'fact',authorUserId:null,entityId:'e',field:'serial',value:'456'}]);
 expect(result.home.history).toHaveLength(0);expect(result.home.equipment[0].serial).toBe('123');
});

it('holds reused accepted IDs with changed payload and resolves exact immutable replays',()=>{
 const h={id:'h',revision:1,equipment:[{id:'e'}]};const original={id:'same',homeId:'h',kind:'fact',authorUserId:'a',entityId:'e',field:'model',value:'Model A',baseRevision:1};
 const accepted=reconcileContributions(h,[original]).home;accepted.revision=2;
 const changed=reconcileContributions(accepted,[{...original,field:'manufacturer',value:'Vendor B',baseRevision:2}]);expect(changed.home.equipment[0].manufacturer).toBeUndefined();expect(changed.review[0].reason).toBe('accepted-id-collision');expect(changed.home.contributionEvidence).toEqual([original]);
 const replay=reconcileContributions(accepted,[original]);expect(replay.review).toEqual([]);expect(replay.accepted).toEqual([]);expect(replay.resolved).toEqual(['same']);
});
