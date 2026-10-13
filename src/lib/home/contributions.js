import {validAttachment} from './attachments.js';
import {validRecurrence,validCompletionOccurrence} from './recurrence.js';
import {canonicalJSON} from './canonical-json.js';
/** Portable source identifiers are references, never paths or access grants. @param {any} ids */
export function validNoteSources(ids){return Array.isArray(ids)&&ids.length<=100&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'&&/^[a-z0-9][a-z0-9._-]{0,199}$/i.test(id));}
/** Immutable contributions are reconciled against a baseline; conflicting new
 * values are held together rather than resolved by arrival order.
 * @param {any} baseline @param {any[]} contributions
 */
export function reconcileContributions(baseline, contributions) {
 const home=structuredClone(baseline);
 home.notes??=[];home.history??=[];home.contributionEvidence??=[];home.contacts??=[];home.schedules??=[];
 /** @type {string[]} */ const accepted=[];
 /** @type {any[]} */ const review=[];
 const unique=new Map();const collisions=new Set();
 for(const c of contributions){
  if(!c||typeof c!=='object'||Array.isArray(c)){review.push({contribution:{text:'Malformed contribution'},reason:'invalid-shape'});continue;}
  if(c.homeId!==home.id)continue;
  if(unique.has(c.id)&&canonicalJSON(unique.get(c.id))!==canonicalJSON(c))collisions.add(c.id);
  else unique.set(c.id,c);
 }
 /** @type {string[]} */ const resolved=[];
 const unresolved=[...unique.values()].filter(c=>{
  const evidence=home.contributionEvidence.filter((/** @type {any} */ e)=>e.id===c.id);
  if(evidence.length){if(collisions.has(c.id)||evidence.length!==1||canonicalJSON(evidence[0])!==canonicalJSON(c))review.push({contribution:c,reason:'accepted-id-collision'});else resolved.push(c.id);return false;}
  const decisions=(home.reviewDecisions??[]).filter((/** @type {any} */ d)=>d.contributionId===c.id);
  if(!decisions.length)return true;
  if(collisions.has(c.id)||decisions.length!==1||!['reject','accept-fact'].includes(decisions[0].action)||canonicalJSON(decisions[0].contribution)!==canonicalJSON(c)){review.push({contribution:c,reason:'review-decision-mismatch'});return false;}
  resolved.push(c.id);return false;
 });
 /** Validated source additions precede dependent notes; completion ordering is retained. @param {any} row */
 const priority=row=>row.kind==='evidence'?-1:Number(row.kind==='task-completion');
 const rows=unresolved.sort((a,b)=>priority(a)-priority(b)|| (a.kind==='task-completion'&&b.kind==='task-completion'?String(a.occurrenceDueAt??'').localeCompare(String(b.occurrenceDueAt??'')):0));
 /** @param {any} c @param {string} reason */
 const hold=(c,reason)=>review.push({contribution:c,reason});
 const fields=new Set(['model','manufacturer','serial','capacity','installedAt']);
 for(const c of rows){
  if(c.publishedDigestMismatch===true){hold(c,'accepted-id-collision');continue;}
  if(collisions.has(c.id)){hold(c,'id-collision');continue;}
  if(!c.authorUserId||!c.id){hold(c,'missing-provenance');continue;}
  const entity=home.equipment?.find((/** @type {any} */ item)=>item.id===c.entityId);
  if(c.entityId&&!entity){hold(c,'unknown-entity');continue;}
  if(c.contactId&&!home.contacts.some((/** @type {any} */ contact)=>contact.id===c.contactId)){hold(c,'unknown-contact');continue;}
  if(c.kind==='fact'&&c.baseRevision!==undefined&&c.baseRevision!==home.revision){hold(c,'stale-base-revision');continue;}
  if(c.kind==='geometry'){hold(c,'major-model-change');continue;}
  if(c.kind==='evidence-upload'){hold(c,'source-upload-pending');continue;}
  if(c.kind!=='note'&&c.sourceIds!==undefined){
   if(!validNoteSources(c.sourceIds)){hold(c,'invalid-source-references');continue;}
   if(c.sourceIds.some((/** @type {string} */ id)=>(home.sources??[]).filter((/** @type {any} */ source)=>source?.id===id).length!==1)){hold(c,'unknown-source-reference');continue;}
  }
  if(c.kind==='evidence'){
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.id)||!validAttachment(c.attachment)||typeof c.value!=='string'||!c.value.trim()||c.value.length>500||!Number.isFinite(Date.parse(c.recordedAt))||Date.parse(c.recordedAt)>Date.now()){hold(c,'invalid-source-evidence');continue;}
   const sourceId=`evidence-${c.id}`;home.sources??=[];
   const previous=home.sources.find((/** @type {any} */ source)=>source.id===sourceId);
   if(previous&&(canonicalJSON(previous.attachment)!==canonicalJSON(c.attachment)||previous.title!==c.value||previous.authorUserId!==c.authorUserId||previous.equipmentId!==(c.entityId??null))){hold(c,'source-id-collision');continue;}
   if(!home.sources.some((/** @type {any} */ source)=>source.id===sourceId))home.sources.push({id:sourceId,title:c.value,attachment:{...c.attachment},contributionId:c.id,sourceUserId:c.sourceUserId??c.authorUserId,authorUserId:c.authorUserId,recordedAt:c.recordedAt,verifiedAt:null,equipmentId:c.entityId??null});
   if(entity){entity.sourceIds??=[];if(!entity.sourceIds.includes(sourceId))entity.sourceIds.push(sourceId);}
  }else if(c.kind==='note'){
   if(typeof c.text!=='string'||!c.text.trim()){hold(c,'empty-note');continue;}
   if(c.sourceIds!==undefined&&!validNoteSources(c.sourceIds)){hold(c,'invalid-note-sources');continue;}
   if((c.sourceIds??[]).some((/** @type {string} */ id)=>(home.sources??[]).filter((/** @type {any} */ source)=>source?.id===id).length!==1)){hold(c,'unknown-note-source');continue;}
   if(!home.notes.some((/** @type {any} */ n)=>n.id===c.id))home.notes.push(structuredClone(c));
  }else if(c.kind==='fact'){
   if(!entity||!fields.has(c.field)||typeof c.value!=='string'||!c.value.trim()){hold(c,'unsupported-fact');continue;}
   const competing=rows.filter(other=>other.authorUserId&&other.kind==='fact'&&(other.baseRevision===undefined||other.baseRevision===home.revision)&&fields.has(other.field)&&typeof other.value==='string'&&other.value.trim()&&other.entityId===c.entityId&&other.field===c.field);
   const conflict=new Set(competing.map(other=>other.value)).size>1;
   if(conflict || (entity[c.field]!=null&&entity[c.field]!==c.value)){hold(c,'contradiction');continue;}
   entity[c.field]=c.value;
   entity.fieldEvidence??={};entity.fieldEvidence[c.field]??=[];
   if(!entity.fieldEvidence[c.field].some((/** @type {any} */ e)=>e.contributionId===c.id))entity.fieldEvidence[c.field].push({contributionId:c.id,authorUserId:c.authorUserId,recordedAt:c.recordedAt??null,value:c.value,...(c.sourceIds?{sourceIds:[...c.sourceIds]}:{})});
  }else if(c.kind==='contact'){
   if(!c.value||!c.field){hold(c,'invalid-contact');continue;}
   if(!home.contacts.some((/** @type {any} */ contact)=>contact.id===c.id))home.contacts.push({id:c.id,name:c.value,trade:c.field,phone:c.phone??null,email:c.email??null,summary:c.text??'',contributionId:c.id,authorUserId:c.authorUserId,recordedAt:c.recordedAt});
  }else if(c.kind==='schedule'){
   if(!c.value||!['maintenance','chore'].includes(c.field)||!Number.isFinite(Date.parse(c.dueAt))){hold(c,'invalid-schedule');continue;}
   if(c.recurrence!==undefined&&!validRecurrence(c.recurrence,c.dueAt)){hold(c,'invalid-recurrence');continue;}
   if(!home.schedules.some((/** @type {any} */ task)=>task.id===c.id))home.schedules.push({id:c.id,name:c.value,kind:c.field,dueAt:c.dueAt,...(c.recurrence?{recurrence:{every:c.recurrence.every,unit:c.recurrence.unit}}:{}),assignee:c.assignee??null,equipmentId:c.entityId??null,description:c.text??'',contributionId:c.id,authorUserId:c.authorUserId,recordedAt:c.recordedAt});
  }else if(c.kind==='task-completion'){
   const schedule=home.schedules.find((/** @type {any} */ task)=>task.id===c.scheduleId);
   if(!schedule||!Number.isFinite(Date.parse(c.performedAt))||Date.parse(c.performedAt)>Date.now()||!Number.isFinite(Date.parse(c.recordedAt))||Date.parse(c.recordedAt)>Date.now()||Date.parse(c.performedAt)>Date.parse(c.recordedAt)){hold(c,'invalid-task-completion');continue;}
   if(schedule.recurrence&&!validCompletionOccurrence(schedule,home.history,c.occurrenceDueAt)){hold(c,'invalid-task-occurrence');continue;}
   if(!home.history.some((/** @type {any} */ h)=>h.id===c.id))home.history.push({...c,kind:schedule.kind,equipmentId:schedule.equipmentId??null,status:'completed',title:schedule.name,summary:c.text});
  }else if(c.kind==='maintenance'){
   const performed=Date.parse(c.performedAt);const recorded=Date.parse(c.recordedAt);
   if(!Number.isFinite(performed)||!Number.isFinite(recorded)||performed>recorded||recorded>Date.now()||performed>Date.now()){hold(c,'missing-service-date');continue;}
   if(!home.history.some((/** @type {any} */ h)=>h.id===c.id))home.history.push({...c,equipmentId:c.entityId,status:'completed',summary:c.text});
  }else{hold(c,'review-required');continue;}
  accepted.push(c.id);
  if(!home.contributionEvidence.some((/** @type {any} */ e)=>e.id===c.id))home.contributionEvidence.push(structuredClone(c));
 }
 return {home,accepted,review,resolved};
}

/** Accept only portable data, never paths, authority claims or commands.
 * @param {any} input */
export function validateContribution(input) {
 if(!input||typeof input!=='object'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id))throw new Error('A stable contribution ID is required');
 if(typeof input.homeId!=='string'||!input.homeId||input.homeId.length>100)throw new Error('Choose a home');
 if(!['note','fact','maintenance','geometry','contact','schedule','task-completion'].includes(input.kind))throw new Error('Unsupported contribution type');
 /** @type {any} */ const result={id:input.id,homeId:input.homeId,kind:input.kind};
 if(input.baseRevision!==undefined){if(!Number.isSafeInteger(input.baseRevision)||input.baseRevision<0)throw new Error('Invalid base revision');result.baseRevision=input.baseRevision;}
 for(const field of ['entityId','field','value','text','performedAt','phone','email','dueAt','assignee','scheduleId','contactId','occurrenceDueAt']){
  if(input[field]!==undefined){if(typeof input[field]!=='string'||input[field].length>(field==='text'?10000:500))throw new Error('Contribution is too long or invalid');result[field]=input[field].trim();}
 }
 if(['note','geometry','maintenance','task-completion'].includes(input.kind)&&!result.text)throw new Error('Add a description');
 if(input.sourceIds!==undefined){if(!['note','fact','contact','maintenance','schedule','task-completion'].includes(input.kind)||!validNoteSources(input.sourceIds))throw new Error('Choose up to 100 distinct home source IDs; paths and URLs are not source IDs');result.sourceIds=[...input.sourceIds];}
 if(input.kind==='fact'&&(!result.entityId||!['model','manufacturer','serial','capacity','installedAt'].includes(result.field)||!result.value))throw new Error('Choose equipment and a supported fact');
 if(['maintenance','task-completion'].includes(input.kind)&&(!Number.isFinite(Date.parse(result.performedAt))||Date.parse(result.performedAt)>Date.now()))throw new Error('Enter the actual past service date');
 if(input.kind==='contact'&&(!result.value||!result.field))throw new Error('Add provider name and trade');
 if(input.kind==='schedule'&&(!result.value||!['maintenance','chore'].includes(result.field)||!Number.isFinite(Date.parse(result.dueAt))))throw new Error('Choose chore or maintenance and an explicit due date');
 if(input.recurrence!==undefined){if(input.kind!=='schedule'||!validRecurrence(input.recurrence,result.dueAt))throw new Error('Enter a valid explicit recurrence with a calendar due date');result.recurrence={every:input.recurrence.every,unit:input.recurrence.unit};}
 if(input.kind==='task-completion'&&!result.scheduleId)throw new Error('Choose the scheduled task');
 return result;
}
