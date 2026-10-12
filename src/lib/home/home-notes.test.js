import {test,expect} from 'vitest';
import {buildAgentBrief} from './agent-brief.js';
const h={id:'synthetic',schemaVersion:1,revision:1,name:'Example',rooms:[],equipment:[{id:'heat',name:'Example unit'}],contacts:[],history:[],schedules:[],sources:[{id:'manual',title:'Example manual'}]};
const stamp='2026-10-12T12:00:00Z';
test('agent context preserves accepted care text and provenance while excluding unknown properties',()=>{
 const home={...h,notes:[{id:'n1',homeId:'synthetic',kind:'note',entityId:'heat',text:'Use Example-cell when depleted; the stated lifetime is conditional.',recordedAt:'2026-10-01T12:00:00Z',authorUserId:'member',sourceIds:['manual','foreign-source'],performedAt:stamp,dueAt:stamp,status:'completed',path:'/private-unrelated',credential:'secret-marker',nested:{apiKey:'secret-marker'}}]};const before=JSON.stringify(home);
 const b=buildAgentBrief(home,{generatedAt:stamp,role:'viewer'});
 expect(b.home.knowledgeNotes).toMatchObject({status:'available',items:[{id:'n1',entityId:'heat',text:'Use Example-cell when depleted; the stated lifetime is conditional.',recordedAt:'2026-10-01T12:00:00Z',authorUserId:'member',sourceIds:['manual'],textTruncated:false}]});
 expect(JSON.stringify(b.home.knowledgeNotes)).not.toContain('secret-marker');expect(JSON.stringify(b.home.knowledgeNotes)).not.toContain('/private-unrelated');expect(JSON.stringify(b.home.knowledgeNotes)).not.toContain('foreign-source');
 expect(b.home.knowledgeNotes.items[0].performedAt).toBeUndefined();expect(b.home.knowledgeNotes.items[0].dueAt).toBeUndefined();expect(b.home.equipment[0].lastService).toBeNull();expect(b.permissions.canPublishAcceptedSnapshot).toBe(false);expect(JSON.stringify(home)).toBe(before);
});
test('foreign, held, malformed and colliding notes remain explicit rather than becoming empty verified context',()=>{
 const b=buildAgentBrief({...h,notes:[null,{id:'foreign',homeId:'other',text:'foreign-secret'},{id:'held',kind:'geometry',text:'held-secret'},{id:'dupe',text:'first'},{id:'dupe',text:'second'},{id:'valid',text:'Plain note',entityId:'other-unit',recordedAt:'2099-01-01T12:00:00Z'}]},{generatedAt:stamp});
 expect(b.home.knowledgeNotes).toMatchObject({status:'partial',items:[{id:'valid',text:'Plain note',entityId:null,recordedAt:null}],unsupportedCount:5});
 expect(JSON.stringify(b.home.knowledgeNotes)).not.toContain('foreign-secret');expect(JSON.stringify(b.home.knowledgeNotes)).not.toContain('held-secret');expect(JSON.stringify(b.home.knowledgeNotes)).not.toContain('other-unit');
});
test('large note sets and long text retain explicit bounded coverage and originals are unchanged',()=>{
 const home={...h,notes:Array.from({length:110},(_,i)=>({id:'note-'+i,text:'x'.repeat(2000)}))};const before=JSON.stringify(home);const b=buildAgentBrief(home,{generatedAt:stamp});
 expect(b.home.knowledgeNotes).toMatchObject({status:'size-limited'});expect(b.home.knowledgeNotes.items.length).toBeGreaterThan(0);expect(b.home.knowledgeNotes.items.length).toBeLessThan(100);expect(b.home.knowledgeNotes.omittedCount).toBeGreaterThan(0);expect(new TextEncoder().encode(JSON.stringify(b.home.knowledgeNotes.items)).byteLength).toBeLessThanOrEqual(128*1024);expect(JSON.stringify(home)).toBe(before);
 const long=buildAgentBrief({...h,notes:[{id:'long',text:'x'.repeat(10001)}]},{generatedAt:stamp});expect(long.home.knowledgeNotes.status).toBe('size-limited');expect(long.home.knowledgeNotes.items[0].text).toHaveLength(10000);expect(long.home.knowledgeNotes.items[0].textTruncated).toBe(true);
});
test('absent and invalid note collections are distinguished',()=>{
 expect(buildAgentBrief(h).home.knowledgeNotes).toMatchObject({status:'not-recorded',items:[]});expect(buildAgentBrief({...h,notes:{text:'private-unrelated'}}).home.knowledgeNotes).toMatchObject({status:'unverified',items:[]});
});
test('multibyte text respects the serialized byte bound and invalid-only rows never claim verified absence',()=>{
 const b=buildAgentBrief({...h,notes:Array.from({length:20},(_,i)=>({id:'unicode-'+i,text:'家'.repeat(10000)}))},{generatedAt:stamp});
 expect(b.home.knowledgeNotes.status).toBe('size-limited');expect(new TextEncoder().encode(JSON.stringify(b.home.knowledgeNotes.items)).byteLength).toBeLessThanOrEqual(128*1024);expect(b.home.knowledgeNotes.omittedCount).toBeGreaterThan(0);
 const bad=buildAgentBrief({...h,notes:[{id:'foreign',homeId:'other',text:'Secret'}]},{generatedAt:stamp});expect(bad.home.knowledgeNotes).toMatchObject({status:'partial',unsupportedCount:1,items:[]});
});

test('all known source references are retained when they fit the declared byte budget',()=>{
 const sources=Array.from({length:21},(_,i)=>({id:'source-'+i,title:'Example source'}));const sourceIds=sources.map(s=>s.id);const b=buildAgentBrief({...h,sources,notes:[{id:'references',text:'Care evidence',sourceIds}]},{generatedAt:stamp});
 expect(b.home.knowledgeNotes.status).toBe('available');expect(b.home.knowledgeNotes.items[0].sourceIds).toEqual(sourceIds);
});
