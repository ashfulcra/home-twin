import {createHash} from 'node:crypto';
import {reconcileContributions} from '../src/lib/home/contributions.js';
import {canonicalJSON} from '../src/lib/home/canonical-json.js';
/** Prepare only a local candidate. Reviewer names in a file are not authenticated authority.
 * @param {any} baseline @param {any[]} contributions @param {any[]} decisions */
export function applyReviewDecisions(baseline,contributions,decisions){
 if(!Array.isArray(decisions)||!Array.isArray(contributions)||!Number.isSafeInteger(baseline.revision)||!baseline.ownerUserId)throw Error('Versioned home with designated owner and decision array required');
 const home=structuredClone(baseline);home.reviewDecisions??=[];
 const ids=new Set();const targets=new Set();const fields=new Set();let changes=0;
 for(const d of decisions){
  if(!d||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.id)||ids.has(d.id))throw Error('Unique stable decision ID required');ids.add(d.id);
  const fingerprint=canonicalJSON(d);const previous=home.reviewDecisions.find((/** @type {any} */ e)=>e.id===d.id);
  if(previous){if(previous.decisionFingerprint!==fingerprint)throw Error('Decision ID has different content');continue;}
  if(d.homeId!==home.id||d.baseRevision!==baseline.revision||d.reviewerUserId!==baseline.ownerUserId||!['accept-fact','reject'].includes(d.action)||typeof d.reason!=='string'||!d.reason.trim()||!Array.isArray(d.sourceIds)||!d.sourceIds.length||d.sourceIds.some((/** @type {any} */ s)=>typeof s!=='string'||!s)||!Number.isFinite(Date.parse(d.recordedAt))||Date.parse(d.recordedAt)>Date.now())throw Error('Invalid decision scope, revision, reviewer or evidence');
  if(targets.has(d.contributionId))throw Error('Multiple decisions for one contribution');targets.add(d.contributionId);
  const matches=contributions.filter(c=>c?.id===d.contributionId&&c.homeId===home.id);
  const unique=new Map(matches.map(c=>[canonicalJSON(c),c]));
  if(unique.size!==1||!unique.has(canonicalJSON(d.contribution)))throw Error('Exact unambiguous contribution required');
  const c=matches[0];if(!c.authorUserId)throw Error('Source attribution required');
  // Only held contributions are eligible; arbitrary writes cannot be smuggled in as reviews.
  const held=reconcileContributions(baseline,contributions).review.find(r=>r.contribution?.id===c.id);
  if(!held||['id-collision','missing-provenance'].includes(held.reason))throw Error('Contribution is not eligible for review');
  if(d.action==='accept-fact'){
   const entity=home.equipment?.find((/** @type {any} */ e)=>e.id===c.entityId);const key=`${c.entityId}:${c.field}`;
   if(c.kind!=='fact'||held.reason!=='contradiction'||!entity||!['model','manufacturer','serial','capacity','installedAt'].includes(c.field)||typeof c.value!=='string'||!c.value.trim()||fields.has(key)||(entity[c.field]??null)!==d.priorValue)throw Error('Supported fact with exact prior value required');fields.add(key);
   entity[c.field]=c.value;entity.fieldEvidence??={};entity.fieldEvidence[c.field]??=[];entity.fieldEvidence[c.field].push({contributionId:c.id,authorUserId:c.authorUserId,recordedAt:c.recordedAt??null,value:c.value,reviewDecisionId:d.id,reviewerUserId:d.reviewerUserId,reviewedAt:d.recordedAt,sourceIds:d.sourceIds});
  }
  home.reviewDecisions.push({...d,contributionHash:createHash('sha256').update(canonicalJSON(c)).digest('hex'),decisionFingerprint:fingerprint});changes++;
 }
 if(changes){if(baseline.revision>=Number.MAX_SAFE_INTEGER)throw Error('Snapshot revision exhausted');home.revision=baseline.revision+1;}
 const result=reconcileContributions(home,contributions);
 return {...result,authority:'unverified-offline',remoteWrites:false,decisionCount:changes};
}
