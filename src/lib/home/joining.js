import {existingHomeDeployment} from './deployment.js';
/** @param {any} v */
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
/** Stable UUID derived from the normalized intent, including its declared time.
 * Full SHA-256 additionally binds the storage path and request code.
 * @param {any} value */
export async function joinContentDigest(value){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
/** @param {any} value */
export async function joinIntentID(value){
 const {id,...intent}=value;
 const hex=(await joinContentDigest(JSON.stringify(intent))).slice(0,32).split('');hex[12]='5';hex[16]=((parseInt(hex[16],16)&3)|8).toString(16);
 const s=hex.join('');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}
/** @param {any} target */
function validateTarget(target){return existingHomeDeployment({HOME_MODE:'existing',HOME_ID:target?.homeId,HOME_OWNER_USER_ID:target?.ownerUserId});}
/** Client identity/path claims are deliberately ignored. @param {any} input @param {any} target @param {any} userId @param {string} recordedAt */
export function createJoinRequest(input,target,userId,recordedAt){
 validateTarget(target);
 if(!input||!uuid(input.id)||!uuid(userId)||userId===target.ownerUserId||!['viewer','contributor'].includes(input.requestedRole)||typeof input.introduction!=='string'||!input.introduction.trim()||input.introduction.length>1000||typeof recordedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(recordedAt)||!Number.isFinite(Date.parse(recordedAt)))throw new Error('Enter a valid request ID, role and short introduction');
 return {schema:'home-twin-join-request/1',id:input.id,homeId:target.homeId,ownerUserId:target.ownerUserId,authorUserId:userId,requestedRole:input.requestedRole,introduction:input.introduction.trim(),recordedAt,timeBasis:'requester-provided'};
}
/** @param {any} code @param {any} target */
export function parseJoinCode(code,target){
 validateTarget(target);if(typeof code!=='string'||code.length>300)throw new Error('Invalid request code');
 const [homeId,userId,requestId,digest,...extra]=code.split(':');
 if(homeId!==target.homeId||!uuid(userId)||userId===target.ownerUserId||!uuid(requestId)||typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest)||extra.length)throw new Error('Request code must identify this home, prospective member and exact contents');
 return {homeId,userId,requestId,digest,path:`/shared/home-twin/${homeId}/join-requests/${requestId}-${digest}.json`};
}
/** Shared file attribution comes from the requested Fulcra source account.
 * @param {any} value @param {any} code @param {any} target */
export function validateSharedJoinRequest(value,code,target){
 if(!value||value.schema!=='home-twin-join-request/1'||value.id!==code.requestId||value.homeId!==target.homeId||value.ownerUserId!==target.ownerUserId||value.authorUserId!==code.userId)throw new Error('Shared request does not match its source account and this home');
 return createJoinRequest(value,target,code.userId,value.recordedAt);
}
/** Owner decision is an intent for the designated maintainer, not a grant.
 * @param {any} request @param {any} input @param {any} context @param {string} recordedAt */
export function buildJoinReview(request,input,context,recordedAt){
 const target={homeId:context?.homeId,ownerUserId:context?.ownerUserId};validateTarget(target);
 if(context.userId!==target.ownerUserId||!uuid(input?.id)||!['approve','reject'].includes(input?.decision)||(input.decision==='approve'&&!['viewer','contributor'].includes(input.role))||!Number.isInteger(context.homeRevision)||context.homeRevision<1||typeof context.homeFileVersion!=='string'||!context.homeFileVersion||context.homeFileVersion.length>200||typeof context.homeDigest!=='string'||!/^[a-f0-9]{64}$/.test(context.homeDigest)||typeof context.publicationDigest!=='string'||!/^[a-f0-9]{64}$/.test(context.publicationDigest)||typeof context.requestDigest!=='string'||!/^[a-f0-9]{64}$/.test(context.requestDigest)||!Number.isFinite(Date.parse(recordedAt)))throw new Error('Review requires the current owner, home baseline and exact request');
 const source=parseJoinCode(`${request.homeId}:${request.authorUserId}:${request.id}:${context.requestDigest}`,target);validateSharedJoinRequest(request,source,target);
 if(typeof recordedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(recordedAt))throw new Error('Keep the same declared review time on retries');
 return {schema:'home-twin-join-review/2',id:input.id,homeId:target.homeId,ownerUserId:target.ownerUserId,authorUserId:context.userId,recipientUserId:source.userId,requestId:source.requestId,requestPath:source.path,requestDigest:context.requestDigest,homeRevision:context.homeRevision,homeFileVersion:context.homeFileVersion,homeDigest:context.homeDigest,publicationDigest:context.publicationDigest,decision:input.decision,role:input.decision==='approve'?input.role:null,scope:{publicationPath:`/shared/home-twin/${target.homeId}/home.json`,originalEvidencePaths:[],fileHistory:false},recordedAt,timeBasis:'owner-provided',status:input.decision==='approve'?'reviewed-awaiting-publication-and-share':'rejection-recorded'};
}
