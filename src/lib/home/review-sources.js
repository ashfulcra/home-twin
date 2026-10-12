import {validNoteSources} from './contributions.js';
import {validAttachment} from './attachments.js';
/** @param {any} value */
const boundedText=value=>typeof value==='string'?value.slice(0,500):null;
/** Accepted equipment IDs predate note-input syntax. Export only bounded, non-path identities.
 * @param {any} id */
const validEntitySourceId=id=>typeof id==='string'&&id.length>0&&id.length<=200&&!/[\\/\x00-\x1f\x7f]/.test(id);
/** Read-only current-home attribution. Reference presence does not establish access or accuracy.
 * @param {any} home @param {any} contribution @param {any} entity */
export function buildReviewSources(home,contribution,entity){
 const catalogAvailable=Array.isArray(home.sources);
 const records=catalogAvailable?home.sources:[];
 /** @param {string} id */
 const matching=id=>records.filter((/** @type {any} */ s)=>s?.id===id);
 /** @param {any} source */
 const metadata=source=>({id:source.id,title:boundedText(source.title),verifiedAt:boundedText(source.verifiedAt),hasOriginalReference:typeof source.path==='string'&&!!source.path.trim()||validAttachment(source.attachment)});
 const declared=contribution.kind==='note'&&contribution.sourceIds!==undefined;
 const valid=declared&&catalogAvailable&&contribution.homeId===home.id&&validNoteSources(contribution.sourceIds);
 /** @type {string[]} */const noteIds=valid?contribution.sourceIds:[];
 const noteItems=noteIds.slice(0,40).map(id=>{
  const found=matching(id);const source=found.length===1?metadata(found[0]):null;
  return {id,status:found.length===1?'known':found.length?'ambiguous':'unknown',title:source?.title??null,hasOriginalReference:source?.hasOriginalReference??false};
 });
 const noteSourceReferences={status:!declared?'not-recorded':!valid?'unverified':noteIds.length>40?'size-limited':'complete',items:noteItems,omittedCount:valid?Math.max(0,noteIds.length-40):0,limit:40};
 const entityValues=Array.isArray(entity?.sourceIds)?entity.sourceIds:[];
 const entityIds=entityValues.filter(validEntitySourceId);
 const unsupportedEntityCount=entityValues.length-entityIds.length+(entity?.sourceIds!==undefined&&!Array.isArray(entity.sourceIds)?1:0);
 /** @type {string[]} */const ids=[...new Set([...entityIds,...noteIds])];
 const known=ids.flatMap(id=>{const found=matching(id);return found.length===1?[metadata(found[0])]:[];});
 return {noteSourceReferences,sources:known.slice(0,40),sourcesOmittedCount:Math.max(0,known.length-40),sourceReferencesUnverifiedCount:ids.length-known.length+unsupportedEntityCount};
}
