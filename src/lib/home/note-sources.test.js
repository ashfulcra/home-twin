import {test,expect} from 'vitest';
import {validateContribution,reconcileContributions} from './contributions.js';
import {searchHomeKnowledge} from './knowledge-search.js';
import {buildAgentBrief} from './agent-brief.js';
const id='12345678-1234-4123-8123-123456789abc';
const sourceId='22345678-1234-4123-8123-123456789abc';
const stamp='2026-10-09T12:00:00Z';
const home={id:'example',revision:1,equipment:[{id:'heat',name:'Example furnace'}],rooms:[],contacts:[],history:[],schedules:[],sources:[{id:'manual',title:'Example manual',path:'/example/original.txt'}]};
const note={id,homeId:'example',kind:'note',entityId:'heat',text:'Example filter guidance',sourceIds:['manual']};
/** @param {any} input */
const stampNote=input=>({...input,authorUserId:'member',recordedAt:stamp});
test('submission preserves explicit source IDs without accepting author or path claims',()=>{
 const input={...note,authorUserId:'forged',path:'/unrelated-private',nested:{token:'secret'}};const before=JSON.stringify(input);const portable=validateContribution(input);
 expect(portable.sourceIds).toEqual(['manual']);expect(portable.authorUserId).toBeUndefined();expect(portable.path).toBeUndefined();expect(portable.nested).toBeUndefined();expect(JSON.stringify(input)).toBe(before);
});
test('portable reference validation rejects malformed, duplicate, path and oversized IDs',()=>{
 for(const sourceIds of [null,{},'manual',[''],['manual','manual'],['../private'],['https://example.com/manual'],[{id:'manual'}],['x'.repeat(201)],Array.from({length:101},(_,i)=>'source-'+i)])expect(()=>validateContribution({...note,sourceIds})).toThrow();
 expect(()=>validateContribution({...note,sourceIds:[]})).not.toThrow();
});
test('validated known references reach search and the private brief once without altering originals',()=>{
 const before=JSON.stringify(home);const portable=validateContribution(note);const row=stampNote(portable);const result=reconcileContributions(home,[row,row]);
 expect(result.review).toEqual([]);expect(result.home.notes).toHaveLength(1);expect(result.home.contributionEvidence).toEqual([row]);
 expect(searchHomeKnowledge(result.home,'filter')[0].sources).toEqual([{id:'manual',title:'Example manual'}]);
 expect(buildAgentBrief(result.home,{generatedAt:'2026-10-12T12:00:00Z'}).home.knowledgeNotes.items[0].sourceIds).toEqual(['manual']);
 expect(JSON.stringify(home)).toBe(before);expect(result.home.history).toEqual([]);
 const retry=reconcileContributions(result.home,[row]);expect(retry.accepted).toEqual([]);expect(retry.home.notes).toHaveLength(1);
});
test('unknown and ambiguous source references hold original notes instead of dropping links',()=>{
 const row=stampNote({...note,sourceIds:['other-home-source']});const result=reconcileContributions(home,[row]);expect(result.accepted).toEqual([]);expect(result.home.notes).toEqual([]);expect(result.review).toEqual([{contribution:row,reason:'unknown-note-source'}]);
 const ambiguous=reconcileContributions({...home,sources:[...home.sources,{id:'manual',title:'Conflicting reference'}]},[stampNote(note)]);expect(ambiguous.accepted).toEqual([]);expect(ambiguous.review[0].reason).toBe('unknown-note-source');
});
test('malformed direct intake references are held without crashing or changing their payload',()=>{
 const row=stampNote({...note,sourceIds:{path:'/private-other'}});const before=JSON.stringify(row);const result=reconcileContributions(home,[row]);expect(result.home.notes).toEqual([]);expect(result.review[0]).toEqual({contribution:row,reason:'invalid-note-sources'});expect(JSON.stringify(row)).toBe(before);
});
const evidence={id:sourceId,homeId:'example',kind:'evidence',entityId:'heat',value:'New original',authorUserId:'member',recordedAt:stamp,attachment:{sha256:'a'.repeat(64),sizeBytes:10,mimeType:'text/plain',extension:'txt',originalName:'example.txt'}};
test('validated original evidence resolves a dependent note regardless of arrival order',()=>{
 const row=stampNote({...note,sourceIds:['evidence-'+sourceId]});
 for(const rows of [[row,evidence],[evidence,row]]){
  const result=reconcileContributions(home,rows);expect(result.review).toEqual([]);expect(new Set(result.accepted)).toEqual(new Set([id,sourceId]));expect(result.home.notes[0].sourceIds).toEqual(['evidence-'+sourceId]);
 }
});
test('colliding or foreign source contributions cannot make an unknown note reference acceptable',()=>{
 const row=stampNote({...note,sourceIds:['evidence-'+sourceId]});
 const collided=reconcileContributions(home,[row,evidence,{...evidence,value:'Other original'}]);expect(collided.accepted).toEqual([]);expect(collided.home.notes).toEqual([]);expect(collided.review.find(r=>r.contribution.id===id)?.reason).toBe('unknown-note-source');
 const foreign=reconcileContributions(home,[row,{...evidence,homeId:'foreign-home'}]);expect(foreign.accepted).toEqual([]);expect(foreign.review).toEqual([{contribution:row,reason:'unknown-note-source'}]);
});
test('legacy no-reference payload stays exact and references are restricted to notes',()=>{
 const legacy={id,homeId:'example',kind:'note',text:'Legacy note'};expect(validateContribution(legacy)).toEqual(legacy);
 expect(()=>validateContribution({...note,kind:'fact',field:'model',value:'Example model'})).toThrow();
});
test('editing a candidate note cannot mutate its original source attribution or retained evidence',()=>{
 const original=stampNote(note);const before=JSON.stringify(original);const result=reconcileContributions(home,[original]);
 result.home.notes[0].sourceIds[0]='changed-reference';
 expect(original.sourceIds).toEqual(['manual']);expect(result.home.contributionEvidence[0].sourceIds).toEqual(['manual']);expect(JSON.stringify(original)).toBe(before);
});
