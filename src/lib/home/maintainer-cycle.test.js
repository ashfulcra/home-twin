import {test,expect} from 'vitest';
import {buildMaintainerCycle} from './maintainer-cycle.js';
const home={schemaVersion:1,id:'example',revision:1,name:'Example',ownerUserId:'owner',equipment:[{id:'heat',name:'Heating',model:null}],sources:[],rooms:[],contacts:[],history:[],schedules:[],notes:[]};
const input={home,rows:[],principalId:'owner',root:'/shared/home-twin/example',baselineVersion:'v1',ingestedAt:'2026-01-01T12:00:00Z',receipts:[],unavailableMembers:[]};
test('same material input yields stable cycle and task identities across receipt times/order',()=>{
 const a=buildMaintainerCycle(input);const b=buildMaintainerCycle({...input,ingestedAt:'2026-01-02T12:00:00Z'});
 expect(a.cycleId).toBe(b.cycleId);expect(a.work.map(t=>t.id)).toEqual(b.work.map(t=>t.id));expect(a.work.some(t=>t.kind==='capture')).toBe(true);expect(a.remoteWrites).toBe(false);
});
test('routine facts become a candidate while contradictions and missing reads remain actionable',()=>{
 const c={id:'11111111-1111-4111-8111-111111111111',homeId:'example',kind:'fact',entityId:'heat',field:'model',value:'Known',authorUserId:'owner'};
 const p=buildMaintainerCycle({...input,rows:[c],unavailableMembers:['member']});expect(p.candidate.equipment[0].model).toBe('Known');expect(home.equipment[0].model).toBeNull();expect(p.work.some(t=>t.kind==='capture'&&'entityId' in t&&t.entityId==='heat'&&'questionKind' in t&&t.questionKind==='equipment-details')).toBe(false);expect(p.work.some(t=>t.kind==='access-blocker')).toBe(true);
 const r=buildMaintainerCycle({...input,home:{...home,equipment:[{id:'heat',name:'Heating',model:'Prior'}]},rows:[c]});expect(r.candidate.equipment[0].model).toBe('Prior');expect(r.work.some(t=>t.kind==='review')).toBe(true);expect(r.review.items[0].priorValue).toBe('Prior');
});
test('identity/home/root/version mismatches reject before a usable cycle is created',()=>{
 for(const patch of [{principalId:'member'},{root:'/home/unrelated'},{home:{...home,id:'foreign'}},{baselineVersion:null}])expect(()=>buildMaintainerCycle({...input,...patch})).toThrow();
 expect(buildMaintainerCycle({...input,root:'/home/twin'}).root).toBe('/home/twin');
});
test('content change changes cycle identity but equivalent incoming order does not',()=>{
 const note={id:'11111111-1111-4111-8111-111111111111',homeId:'example',kind:'note',authorUserId:'owner',text:'A'};const second={...note,id:'22222222-2222-4222-8222-222222222222',text:'B'};
 const a=buildMaintainerCycle({...input,rows:[note,second]});const b=buildMaintainerCycle({...input,rows:[second,note]});expect(a.cycleId).toBe(b.cycleId);expect(buildMaintainerCycle({...input,rows:[note]}).cycleId).not.toBe(a.cycleId);
});

test('independent project cycles retain their explicit root in stable work',()=>{const c=buildMaintainerCycle({...input,root:'/Example_Residence/twin'});expect(c.root).toBe('/Example_Residence/twin');expect(c.material.root).toBe(c.root);});
