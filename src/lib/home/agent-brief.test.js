import {test,expect} from 'vitest';
import {buildAgentBrief} from './agent-brief.js';
const home={schemaVersion:1,revision:1,id:'example-home',name:'Example home',rooms:[],equipment:[{id:'heat',name:'Heating system',inventoryStatus:'needs-details',model:null,sourceIds:['intake'],vendorToken:'do-not-export'}],contacts:[],history:[],schedules:[],sources:[{id:'intake',title:'Intake',path:'/shared/home-twin/example-home/sources/intake.json',verifiedAt:null}],notes:[],plan:null};
test('unknown inventory yields targeted questions without guessed service dates or geometry',()=>{
 const b=buildAgentBrief(home,{role:'maintainer',generatedAt:'2026-10-09T15:00:00Z'});
 expect(b.home.equipment[0]?.model).toBeNull();expect(b.home.equipment[0]?.lastService).toBeNull();
 expect(b.questions).toEqual(expect.arrayContaining([expect.objectContaining({kind:'equipment-details',entityId:'heat'}),expect.objectContaining({kind:'service-history',entityId:'heat'}),expect.objectContaining({kind:'layout'})]));
 expect(JSON.stringify(b)).not.toContain('do-not-export');expect(home.equipment[0].model).toBeNull();
});
test('known service/provider evidence survives; contributors are not appointed maintainer',()=>{
 const h={...home,contacts:[{id:'p',name:'Example provider',phone:'555-0100',trade:'HVAC'}],equipment:[{id:'heat',name:'Heating',model:'Known model',contactId:'p'}],history:[{id:'visit',kind:'maintenance',status:'completed',equipmentId:'heat',performedAt:'2026-09-01',summary:'Recorded visit'}]};
 const b=buildAgentBrief(h,{role:'contributor',generatedAt:'2026-10-09T15:00:00Z'});
 expect(b.home.equipment[0]?.lastService?.performedAt).toBe('2026-09-01');expect(b.home.equipment[0]?.provider?.name).toBe('Example provider');expect(b.permissions.canPublishAcceptedSnapshot).toBe(false);
 expect(b.questions.some(q=>q.kind==='service-history'&&q.entityId==='heat')).toBe(false);
});
test('nested extras are excluded and provider attribution is retained',()=>{
 const h={...home,knowledgeGaps:['Known gap',{apiKey:'nested-secret'}],sources:[{id:'s',title:'Source',path:'/source',origin:{vendorToken:'nested-secret'}}],contacts:[{id:'p',name:'Provider',sourceIds:['s'],authorUserId:'member',recordedAt:'2026-09-01',fieldEvidence:{phone:[{contributionId:'c',authorUserId:'member',recordedAt:'2026-09-01',value:'555-0100',apiKey:'nested-secret'}]}}],equipment:[{id:'heat',name:'Heating',contactId:'p',fieldEvidence:{model:[{contributionId:'c',authorUserId:'member',recordedAt:'2026-09-01',value:'Model',apiKey:'nested-secret'}],vendorToken:[{value:'nested-secret'}]}}]};
 const b=buildAgentBrief(h);
 expect(JSON.stringify(b)).not.toContain('nested-secret');
 expect(b.home.equipment[0].provider.sourceIds).toEqual(['s']);
 expect(b.home.equipment[0].provider.authorUserId).toBe('member');
 expect(b.home.equipment[0].fieldEvidence.model[0].contributionId).toBe('c');
});
