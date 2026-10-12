import {test,expect} from 'vitest';
import {buildReviewPacket} from './review-packet.js';
const home={id:'example',revision:1,equipment:[{id:'heat',name:'Example unit',sourceIds:['manual']}],sources:[{id:'manual',title:'Example manual',path:'/private-example/original.md',verifiedAt:null,credential:'secret-marker'},{id:'metadata',title:'Metadata only'}]};
const row={id:'note',homeId:'example',kind:'note',text:'Example note',authorUserId:'member',sourceIds:['manual','not-yet-known']};
/** @param {any} [h] @param {any} [c] */
const packet=(h=home,c=row)=>buildReviewPacket(h,[{contribution:c,reason:'unknown-note-source'}],{role:'maintainer'});
test('held whole-home notes retain known and unknown requested original references',()=>{
 const before=JSON.stringify(row);const item=packet().items[0];
 expect(item.noteSourceReferences).toMatchObject({status:'complete',omittedCount:0,items:[{id:'manual',status:'known',title:'Example manual',hasOriginalReference:true},{id:'not-yet-known',status:'unknown',title:null,hasOriginalReference:false}]});
 expect(item.sources).toEqual([{id:'manual',title:'Example manual',verifiedAt:null,hasOriginalReference:true}]);expect(JSON.stringify(item)).not.toContain('/private-example');expect(JSON.stringify(item)).not.toContain('secret-marker');expect(JSON.stringify(row)).toBe(before);
});
test('known equipment originals provide link metadata while metadata-only records do not promise originals',()=>{
 const fact={id:'fact',homeId:'example',kind:'fact',entityId:'heat',field:'model',value:'Proposed'};const item=packet(home,fact).items[0];expect(item.sources[0].hasOriginalReference).toBe(true);
 const metadata=packet(home,{...row,sourceIds:['metadata']}).items[0];expect(metadata.sources[0].hasOriginalReference).toBe(false);expect(metadata.noteSourceReferences?.items?.[0]).toMatchObject({status:'known',hasOriginalReference:false});
});
test('duplicate source identities remain ambiguous and cannot become original links',()=>{
 const h={...home,sources:[...home.sources,{id:'manual',title:'Different source',path:'/private-another/original.md'}]};const item=packet(h,{...row,sourceIds:['manual']}).items[0];expect(item.noteSourceReferences?.items?.[0]).toMatchObject({id:'manual',status:'ambiguous',hasOriginalReference:false});expect(item.sources.every((/** @type {any} */ s)=>!s.hasOriginalReference)).toBe(true);
});
test('invalid note references and unscoped rows retain explicit incomplete context without exporting raw properties',()=>{
 for(const sourceIds of [{path:'/private-elsewhere',token:'secret-marker'},['../private'],['manual','manual'],Array.from({length:101},(_,i)=>'source-'+i)]){
  const item=packet(home,{...row,sourceIds}).items[0];expect(item.noteSourceReferences).toMatchObject({status:'unverified',items:[]});expect(JSON.stringify(item)).not.toContain('secret-marker');expect(JSON.stringify(item)).not.toContain('/private-elsewhere');
 }
 const missing=packet(home,{...row,homeId:undefined}).items[0];expect(missing.noteSourceReferences?.status).toBe('unverified');expect(packet(home,{...row,homeId:'foreign'}).items).toEqual([]);
});
test('large valid reference sets expose bounded coverage rather than silently dropping identities',()=>{
 const sources=Array.from({length:70},(_,i)=>({id:'record-'+i,title:'Example record',path:'/example/'+i}));const c={...row,sourceIds:sources.map(s=>s.id)};const before=JSON.stringify(c);const item=packet({...home,sources},c).items[0];expect(item.noteSourceReferences?.status).toBe('size-limited');expect(item.noteSourceReferences?.items).toHaveLength(40);expect(item.noteSourceReferences?.omittedCount).toBe(30);expect(item.sources).toHaveLength(40);expect(item.sourcesOmittedCount).toBe(30);expect(JSON.stringify(c)).toBe(before);
});
test('source context preserves existing private viewer decision restrictions and never exports attachment data',()=>{
 const h={...home,sources:[{id:'manual',title:'Example manual',attachment:{sha256:'a'.repeat(64),sizeBytes:10,mimeType:'text/plain',extension:'txt',originalName:'original.txt',token:'secret-marker'}}]};const p=buildReviewPacket(h,[{contribution:row,reason:'unknown-note-source'}],{role:'viewer'});expect(p.items[0].sources[0]?.hasOriginalReference).toBe(true);expect(p.permissions.canPrepareDecision).toBe(false);expect(p.remoteWrites).toBe(false);expect(JSON.stringify(p)).not.toContain('secret-marker');expect(JSON.stringify(p)).not.toContain('original.txt');
});

test('accepted equipment legacy IDs remain visible without applying note-input syntax to existing evidence',()=>{
 const h={...home,equipment:[{id:'heat',sourceIds:['drawing:1']}],sources:[{id:'drawing:1',title:'Example drawing',path:'/example/drawing.pdf'}]};
 const item=packet(h,{id:'fact',homeId:'example',kind:'fact',entityId:'heat',field:'model',value:'Proposed'}).items[0];
 expect(item.sources).toEqual([{id:'drawing:1',title:'Example drawing',verifiedAt:null,hasOriginalReference:true}]);expect(item.sourceReferencesUnverifiedCount).toBe(0);
});
test('unsupported equipment references flag incomplete coverage without exporting unsafe IDs',()=>{
 const h={...home,equipment:[{id:'heat',sourceIds:['manual','../private',null]}]};
 const item=packet(h,{id:'fact',homeId:'example',kind:'fact',entityId:'heat',field:'model',value:'Proposed'}).items[0];
 expect(item.sources).toHaveLength(1);expect(item.sourceReferencesUnverifiedCount).toBe(2);expect(JSON.stringify(item)).not.toContain('../private');
});
test('unavailable source catalog cannot verify requested note references as absent',()=>{
 const item=packet({...home,sources:{unexpected:'secret-marker'}},{...row,sourceIds:['manual']}).items[0];
 expect(item.noteSourceReferences).toMatchObject({status:'unverified',items:[]});expect(JSON.stringify(item)).not.toContain('secret-marker');
});
