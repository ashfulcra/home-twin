import {describe,it,expect} from 'vitest';
import {searchHomeKnowledge} from './knowledge-search.js';
const home={id:'synthetic',asOf:'2026-10-10T12:00:00Z',equipment:[{id:'heat',name:'Furnace',system:'Heating',model:'Example 12',contactId:'pro',sourceIds:['invoice'],facts:[{name:'Filter',value:'20 x 25'}],secret:'NEVER EXPORT'}],contacts:[{id:'pro',name:'Example Heating',phone:'555-0100',email:'service@example.test',secret:'NEVER EXPORT'}],history:[{id:'done',equipmentId:'heat',contactId:'pro',kind:'maintenance',status:'completed',performedAt:'2026-09-10',summary:'Filter replaced',sourceIds:['invoice']},{id:'planned',equipmentId:'heat',kind:'maintenance',status:'planned',performedAt:'2026-12-01'}],schedules:[{id:'care',name:'Check filter',equipmentId:'heat',kind:'maintenance',dueAt:'2026-11-01',sourceIds:['invoice']}],sources:[{id:'invoice',title:'Example invoice',verifiedAt:'2026-09-10',path:'/private/original'}],rooms:[]};
describe('home knowledge finder',()=>{
 it('finds associated providers and service records from an equipment query',()=>{const r=searchHomeKnowledge(home,'FURNACE');expect(r.map(x=>x.kind)).toEqual(['equipment','provider','history','history','schedule']);expect(r[0].lastServiceAt).toBe('2026-09-10');expect(r.find(x=>x.kind==='provider')?.phone).toBe('555-0100');expect(r[0].sources).toEqual([{id:'invoice',title:'Example invoice'}]);});
 it('matches multiple fact and provider words without searching arbitrary private properties',()=>{expect(searchHomeKnowledge(home,'filter 25')[0].entityId).toBe('heat');expect(searchHomeKnowledge(home,'never export')).toEqual([]);expect(JSON.stringify(searchHomeKnowledge(home,'heating'))).not.toContain('NEVER EXPORT');expect(JSON.stringify(searchHomeKnowledge(home,'heating'))).not.toContain('/private/original');});
 it('keeps missing and future service unknown',()=>{const r=searchHomeKnowledge({...home,contacts:[],history:[{id:'future',kind:'maintenance',status:'completed',equipmentId:'heat',performedAt:'2026-12-01'}]},'furnace');expect(r[0].lastServiceAt).toBeNull();expect(r[0].providerName).toBeNull();});
 it('bounds result volume and rejects absent queries',()=>{expect(searchHomeKnowledge(home,'  ')).toEqual([]);const many={...home,equipment:Array.from({length:60},(_,i)=>({id:String(i),name:'Unit'})),history:[],contacts:[],schedules:[]};expect(searchHomeKnowledge(many,'unit')).toHaveLength(40);});
 it('finds standalone providers using the existing trade format',()=>{const r=searchHomeKnowledge({...home,equipment:[],history:[],schedules:[],contacts:[{id:'plumber',name:'Example Services',trade:'Plumbing'}]},'plumbing');expect(r).toHaveLength(1);expect(r[0].detail).toBe('Plumbing');});
 it('does not retain results from a previous home',()=>{expect(searchHomeKnowledge({id:'other',asOf:home.asOf,equipment:[],contacts:[],history:[],schedules:[],sources:[]},'furnace')).toEqual([]);});
});

it('retrieves accepted equipment care notes without converting their recording date to service history',()=>{
 const h={...home,notes:[{id:'care-note',homeId:'synthetic',kind:'note',entityId:'heat',text:'Example-cell battery reference; lifetime depends on use.',recordedAt:'2026-10-01T12:00:00Z',authorUserId:'member',sourceIds:['invoice'],performedAt:'2026-10-01',dueAt:'2027-01-01',secret:'NEVER EXPORT'}]};
 const rows=searchHomeKnowledge(h,'example-cell furnace');
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({kind:'note',id:'care-note',entityId:'heat',detail:'Example-cell battery reference; lifetime depends on use.',recordedAt:'2026-10-01T12:00:00Z',authorUserId:'member',sources:[{id:'invoice',title:'Example invoice'}]});
 expect(rows[0].performedAt).toBeUndefined();expect(rows[0].dueAt).toBeUndefined();expect(rows[0].lastServiceAt).toBeUndefined();expect(JSON.stringify(rows)).not.toContain('NEVER EXPORT');
 expect(searchHomeKnowledge(h,'furnace')[0].lastServiceAt).toBe('2026-09-10');
});
it('excludes foreign or held note rows and private ledgers from note discovery',()=>{
 const h={...home,notes:[{id:'foreign',homeId:'another',kind:'note',text:'Hidden foreignword'},{id:'held',homeId:'synthetic',kind:'geometry',text:'Hidden heldword'},{id:'valid',homeId:'synthetic',kind:'note',text:'Plain accepted note',privateText:'Hidden privateword'}],review:[{text:'Hidden reviewword'}],contributionEvidence:[{text:'Hidden journalword'}]};
 for(const q of ['foreignword','heldword','privateword','reviewword','journalword'])expect(searchHomeKnowledge(h,q)).toEqual([]);
 expect(searchHomeKnowledge(h,'plain accepted')).toMatchObject([{kind:'note',id:'valid',detail:'Plain accepted note'}]);
 expect(searchHomeKnowledge({...home,id:'other',notes:[]},'plain accepted')).toEqual([]);
});
it('does not choose the first of conflicting duplicate note identities',()=>{
 const h={...home,notes:[{id:'duplicate',text:'Conflicting firstvalue'},{id:'duplicate',text:'Conflicting secondvalue'},{id:'safe',text:'Unrelated safevalue'}]};
 expect(searchHomeKnowledge(h,'firstvalue')).toEqual([]);expect(searchHomeKnowledge(h,'secondvalue')).toEqual([]);expect(searchHomeKnowledge(h,'safevalue')).toHaveLength(1);
});
