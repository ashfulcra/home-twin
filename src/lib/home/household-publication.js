import {validatePlan} from './layout.js';
import {validateReconstruction} from './reconstruction.js';
import {buildArchitectureBrief} from './architecture-brief.js';
import {validateBuilding} from './representative-building.js';
import {canonicalJSON} from './canonical-json.js';
import {joinContentDigest} from './joining.js';
const uuid=/** @param {any} v */v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
/** Allow only primitives and primitive lists from intentionally selected fields.
 * Freeform text is evidence visible in the exact owner preview, not secret detection.
 * @param {any} value @returns {any} */
function field(value){if(typeof value==='string'){if(value.length>10000)throw Error('Publication text exceeds review limit');return value;}if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;if(Array.isArray(value)&&value.length<=200&&value.every(v=>typeof v==='string'||typeof v==='number'&&Number.isFinite(v)))return value.map(field);return undefined;}
/** @param {any} row @param {string[]} keys */
const pick=(row,keys)=>Object.fromEntries(keys.map(k=>[k,field(row?.[k])]).filter(([,v])=>v!==undefined));
/** @param {any} value @param {string[]} keys */
function rows(value,keys){if(value===undefined)return [];if(!Array.isArray(value)||value.length>2000)throw Error('Publication record list exceeds review limit');return value.map(v=>pick(v,keys));}
const attribution=['sourceIds','authorUserId','recordedAt'];
/** Curated schema projection only; unknown properties, source paths and originals excluded.
 * @param {any} home @param {{userId:string,role:string}|null} [member] @returns {any} */
export function householdPublication(home,member=null){
 if(home?.schemaVersion!==1||typeof home.id!=='string'||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(home.id)||!uuid(home.ownerUserId)||!Number.isSafeInteger(home.revision)||home.revision<1||typeof home.name!=='string'||!home.name.trim())throw Error('Current home identity/version required');
 if(member&&(!uuid(member.userId)||member.userId===home.ownerUserId||!['viewer','contributor'].includes(member.role)))throw Error('Exact nonowner recipient and viewer/contributor role required');
 const members=rows(home.members,['userId','role']);const ids=new Set();for(const m of members){if(!uuid(m.userId)||m.userId===home.ownerUserId||!['viewer','contributor'].includes(m.role)||ids.has(m.userId))throw Error('Review current membership before publication');ids.add(m.userId);}
 if(member){const existing=members.find(m=>m.userId===member.userId);if(existing)existing.role=member.role;else members.push({...member});}
 const revision=home.revision+(member?1:0);if(!Number.isSafeInteger(revision))throw Error('Revision limit reached');
 const out={schemaVersion:1,...pick(home,['id','name','ownerUserId','timezone','createdAt']),revision,members,
 rooms:rows(home.rooms,['id','name','level','accuracy',...attribution]),
 equipment:rows(home.equipment,['id','name','system','inventoryStatus','manufacturer','model','serial','capacity','installedAt','roomId','contactId','facts',...attribution]),
 contacts:rows(home.contacts,['id','name','trade','phone','email','address','website','summary',...attribution]),
 history:rows(home.history,['id','equipmentId','scheduleId','contactId','kind','status','performedAt','summary','title','occurrenceDueAt',...attribution]),
 schedules:rows(home.schedules,['id','name','equipmentId','contactId','dueAt','kind','assignee','description','summary',...attribution]),
 notes:rows(home.notes,['id','text','roomId','equipmentId',...attribution]),
 sources:rows(home.sources,['id','title','origin','sha256','verifiedAt','recordedAt','authorUserId','contributionId','sourceUserId','equipmentId']),
 publicationEvidence:rows(home.publicationEvidence,['id','digest']),knowledgeGaps:field(home.knowledgeGaps)??[],plan:home.plan?validatePlan(home.plan):null};
 for(let i=0;i<out.sources.length;i++){const raw=home.sources[i];const digest=raw.attachment?.sha256;if(digest!==undefined){if(typeof digest!=='string'||!/^[a-f0-9]{64}$/i.test(digest)||out.sources[i].sha256&&out.sources[i].sha256.toLowerCase()!==digest.toLowerCase())throw Error('Source checksum needs review');out.sources[i].sha256=digest;}}
 for(let i=0;i<out.equipment.length;i++){const facts=home.equipment[i].facts;if(Array.isArray(facts)&&facts.every((/** @type {any} */f)=>f&&typeof f==='object'&&!Array.isArray(f)))out.equipment[i].facts=rows(facts,['name','value','sourceIds','status']);}
 for(const group of ['equipment','contacts'])for(let i=0;i<out[group].length;i++){
  const evidence=home[group][i].fieldEvidence;if(evidence!==undefined){if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))throw Error('Invalid field provenance');const allowed=group==='equipment'?['name','system','inventoryStatus','manufacturer','model','serial','capacity','installedAt','roomId','contactId']:['name','trade','phone','email','address','website'];out[group][i].fieldEvidence=Object.fromEntries(Object.entries(evidence).filter(([key])=>allowed.includes(key)).map(([key,value])=>[key,rows(value,['contributionId','authorUserId','recordedAt','value','reviewDecisionId','reviewerUserId','reviewedAt','sourceIds'])]));}
 }
 // Recurrence is one explicitly projected structured field, never arbitrary metadata.
 for(let i=0;i<out.schedules.length;i++)if(home.schedules[i].recurrence)out.schedules[i].recurrence=pick(home.schedules[i].recurrence,['every','unit']);
 if(home.reconstruction){
  out.reconstruction={...validateReconstruction(home.reconstruction)};out.reconstruction.source.file='original-not-shared';
  if(home.reconstruction.buildingModel){const brief=buildArchitectureBrief(home.reconstruction.buildingModel);if(brief.status!=='available'||brief.supplementalTruncated)throw Error('Saved building model cannot be fully prepared within review limits');
   const building={schemaVersion:1,units:'feet',coordinateFrame:brief.coordinateFrame,levels:brief.levels,rooms:brief.rooms,walls:brief.walls,features:brief.features.map((/** @type {any} */f)=>({...f,details:Object.fromEntries(Object.entries(f.details).filter(([,v])=>v!==null)),...(f.polygon===null?{polygon:undefined}:{})})),roofs:brief.roofs,floorEnvelopes:brief.floorEnvelopes,assumptions:brief.assumptions,excludedFeatures:brief.excludedFeatures,sourceSpecifications:brief.sourceSpecifications};validateBuilding(building);out.reconstruction.buildingModel=building;
  }
 }
 if(new TextEncoder().encode(JSON.stringify(out)).byteLength>2*1024*1024)throw Error('Household publication exceeds 2 MiB review limit');
 return out;
}

/** Accepted evidence digests support collision-safe replay without exporting private originals.
 * @param {any} home */
export async function prepareHouseholdBase(home){
 const base=householdPublication(home);const unique=new Map();for(const receipt of base.publicationEvidence){if(typeof receipt.id!=='string'||!receipt.id||receipt.id.length>200||typeof receipt.digest!=='string'||!/^[a-f0-9]{64}$/.test(receipt.digest))throw Error('Invalid publication receipt');if(unique.has(receipt.id)&&unique.get(receipt.id)!==receipt.digest)throw Error('Accepted evidence collision needs review');unique.set(receipt.id,receipt.digest);}const entries=[...(home.contributionEvidence??[]),...(home.reviewDecisions??[]).map((/** @type {any} */d)=>d.contribution)];if(entries.length>2000)throw Error('Evidence receipt review limit reached');for(const entry of entries){if(!entry||typeof entry.id!=='string')throw Error('Invalid accepted evidence receipt');const digest=await joinContentDigest(canonicalJSON(entry));if(unique.has(entry.id)&&unique.get(entry.id)!==digest)throw Error('Accepted evidence collision needs review');unique.set(entry.id,digest);}base.publicationEvidence=[...unique].map(([id,digest])=>({id,digest}));return base;
}
