import {test,expect} from 'vitest';import {buildHouseholdFollowups} from './household-followups.js';
const home={schemaVersion:1,id:'example',name:'Home',revision:2,ownerUserId:'owner',equipment:[{id:'heat',name:'Heating',model:'Known',secret:'Do not export'}],sources:[],rooms:[],history:[],contacts:[]};
const context={homeId:'example',ownerUserId:'owner',role:'contributor',fileVersion:'v2',reviewCount:1,unavailableCount:0};
test('current bounded household followups expose questions and useful destinations, never raw report or authority',()=>{const result=buildHouseholdFollowups(home,context);expect(result.homeId).toBe('example');expect(result.revision).toBe(2);expect(result.questions.find(q=>q.kind==='service-history')).toMatchObject({entityId:'heat',destination:'Sources'});expect(result.questions.find(q=>q.kind==='layout')?.destination).toBe('Layout');expect(JSON.stringify(result)).not.toContain('Do not export');expect(JSON.stringify(result)).not.toContain('canPublish');expect(result.reviewCount).toBe(1);});
test('new evidence clears relevant questions without inventing provider or service facts',()=>{const result=buildHouseholdFollowups({...home,history:[{id:'service',kind:'maintenance',status:'completed',equipmentId:'heat',performedAt:'2026-01-01'}],contacts:[{id:'provider',name:'Example'}],equipment:[{...home.equipment[0],contactId:'provider'}]},context);expect(result.questions.some(q=>q.entityId==='heat')).toBe(false);});
test('mismatched scope, unverified role or missing version rejects stale/unscoped work',()=>{for(const options of [{...context,homeId:'other'},{...context,ownerUserId:'other'},{...context,role:'unverified'},{...context,fileVersion:null}])expect(()=>buildHouseholdFollowups(home,options)).toThrow();});

import {resolveSourcePrefill} from './household-followups.js';
test('source shortcut never carries a different home label across reused equipment IDs or changed revision',()=>{const request={homeId:'example',revision:2,entityId:'heat',title:'Heating service record'};expect(resolveSourcePrefill(home,request)).toEqual(request);expect(resolveSourcePrefill({...home,id:'another'},request)).toBeNull();expect(resolveSourcePrefill({...home,revision:3},request)).toBeNull();expect(resolveSourcePrefill(home,{...request,entityId:'missing'})).toBeNull();});

test('disabled layout drafts remove only generic layout capture prompts',()=>{
 const result=buildHouseholdFollowups(home,{...context,layoutDraftsEnabled:false});
 expect(result.questions.some(q=>q.kind==='layout')).toBe(false);
 expect(result.questions.some(q=>q.kind==='service-history')).toBe(true);
 expect(result.totalQuestions).toBe(result.questions.length);
});
