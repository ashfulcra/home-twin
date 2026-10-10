import {test,expect} from 'vitest';
import {buildReviewPacket} from './review-packet.js';
import {reconcileContributions} from './contributions.js';
const home={schemaVersion:1,id:'example',revision:3,equipment:[{id:'furnace',name:'Furnace',model:'Known',sourceIds:['label']}],sources:[{id:'label',title:'Unit label',verifiedAt:null,secret:'omit'}]};
const contribution={id:'11111111-1111-4111-8111-111111111111',homeId:'example',kind:'fact',entityId:'furnace',field:'model',value:'Proposed',baseRevision:3,authorUserId:'member',sourceUserId:'member',recordedAt:'2026-01-01T10:00:00Z'};
test('held fact packet shows prior/proposed evidence without mutating accepted home',()=>{
 const before=structuredClone(home);const result=reconcileContributions(home,[contribution]);const p=buildReviewPacket(home,result.review,{role:'maintainer',fileVersion:'version-1'});
 expect(p.home).toEqual({id:'example',revision:3,fileVersion:'version-1'});expect(p.items[0]).toMatchObject({reason:'contradiction',entity:{id:'furnace',name:'Furnace'},field:'model',priorValue:'Known',proposedValue:'Proposed',authorUserId:'member',sourceUserId:'member',baseRevision:3,currentRevision:3});
 expect(p.items[0].sources).toEqual([{id:'label',title:'Unit label',verifiedAt:null}]);expect(home).toEqual(before);expect(p.remoteWrites).toBe(false);
});
test('foreign and malformed rows cannot smuggle secrets or commands into packet',()=>{
 const p=buildReviewPacket(home,[{reason:'contradiction',contribution:{...contribution,secret:'LEAK',command:'run-this'}},{reason:'other',contribution:{...contribution,homeId:'foreign'}},{reason:'invalid-shape',contribution:{text:'Malformed contribution'}},{reason:'unsupported-fact',contribution:{...contribution,field:'__proto__',value:{secret:'LEAK'}}}],{role:'viewer',secret:'LEAK'});
 expect(p.items).toHaveLength(3);expect(JSON.stringify(p)).not.toContain('LEAK');expect(JSON.stringify(p)).not.toContain('run-this');expect(p.items[2].priorValue).toBeNull();expect(p.items[2].proposedValue).toBeNull();expect(p.permissions.canPrepareDecision).toBe(false);
});
test('stale and colliding identities remain in review; packet grants no decision authority',()=>{
 const rows=[{...contribution,baseRevision:2}];const p=buildReviewPacket(home,reconcileContributions(home,rows).review,{role:'maintainer'});
 expect(p.items[0]).toMatchObject({reason:'stale-base-revision',baseRevision:2,currentRevision:3});expect(p.scope).toContain('read-only');expect(p.nextActions.join(' ')).toContain('current');
 const c=buildReviewPacket(home,reconcileContributions(home,[contribution,{...contribution,value:'Alternate'}]).review);
 expect(c.items[0].reason).toBe('id-collision');expect(c.permissions.canPrepareDecision).toBe(false);
});
test('bounded display retains diagnostic markers instead of exporting arbitrary nested payloads',()=>{
 const p=buildReviewPacket(home,[{reason:'major-model-change',contribution:{...contribution,kind:'geometry',text:'x'.repeat(12000),geometry:{token:'LEAK'}}}]);
 expect(p.items[0].description).toHaveLength(10000);expect(p.items[0].descriptionTruncated).toBe(true);expect(JSON.stringify(p)).not.toContain('LEAK');
});
