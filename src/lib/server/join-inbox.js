import {createHash} from 'node:crypto';
import {parseJoinCode,validateSharedJoinRequest,joinIntentID,buildJoinReview} from '../home/joining.js';
import {canonicalJSON} from '../home/canonical-json.js';
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}',sha='[a-f0-9]{64}';
const uuidRE=new RegExp('^'+uuid+'$'),decisionName=new RegExp('^('+uuid+')-('+sha+')\\.json$');
const digest=(/** @type {string|Uint8Array} */bytes)=>createHash('sha256').update(bytes).digest('hex');
/** Discover only explicitly addressed exact request files. No broad folder scan.
 * @param {any} grants @param {any} target */
export function incomingJoinCandidates(grants,target){
 if(!Array.isArray(grants)||grants.length>5000)throw Error('Incoming grant listing unavailable or exceeds bounded limit');
 const prefix=`file:/shared/home-twin/${target.homeId}/join-requests/`,pattern=new RegExp('^('+uuid+')-('+sha+')\\.json$');
 /** @type {Map<string,any>} */const sources=new Map();let unsupportedCount=0;
 for(const grant of grants){
  if(grant?.grant_type==='self')continue;
  const types=grant?.fulcra_data_types;if(!Array.isArray(types)||types.length>5000||types.some((/** @type {any} */type)=>typeof type!=='string'||!type||type.length>1000))throw Error('Incoming grant type metadata unavailable');
  const related=types.filter((/** @type {any} */t)=>typeof t==='string'&&(t.startsWith(prefix)||t===prefix.slice(0,-1)));
  if(!related.length)continue;
  if(grant.grant_type!=='user'||grant.group_id!==null||grant.share_all_data!==false||grant.time_start!==null||grant.time_end!==null||types.length!==1||!uuidRE.test(grant.sharing_fulcra_userid??'')||grant.sharing_fulcra_userid===target.ownerUserId||!uuidRE.test(grant.grant_id??'')||!uuidRE.test(grant.datashare_id??'')){unsupportedCount++;continue;}
  const match=related[0].slice(prefix.length).match(pattern);if(!match){unsupportedCount++;continue;}
  const code=`${target.homeId}:${grant.sharing_fulcra_userid}:${match[1]}:${match[2]}`;const source=parseJoinCode(code,target);
  const old=sources.get(code);if(old)old.grantIds.push(grant.grant_id);else sources.set(code,{...source,code,grantIds:[grant.grant_id]});
 }
 return {sources:[...sources.values()].map(s=>({...s,grantIds:[...new Set(s.grantIds)].sort()})).sort((a,b)=>a.code.localeCompare(b.code)),unsupportedCount};
}
/** Read-only current owner inbox. Errors never imply no requests.
 * @param {any} access @param {any} transport */
export async function loadJoinInbox(access,transport){
 if(!access.deployment||access.role!=='maintainer'||access.userId!==access.ownerUserId||access.home?.ownerUserId!==access.userId||access.home?.id!==access.deployment.homeId)throw Error('Current configured owner required');
 const target=access.deployment,before=incomingJoinCandidates(await transport.incoming(),target);
 /** @type {any[]} */const requests=[];let unavailableCount=0;
 for(const source of before.sources.slice(0,20)){
  try{const bytes=await transport.readRequest(source);if(!(bytes instanceof Uint8Array)||bytes.length>8192||digest(bytes)!==source.digest)throw Error('Request bytes differ');const request=validateSharedJoinRequest(JSON.parse(new TextDecoder().decode(bytes)),source,target);if(await joinIntentID(request)!==request.id)throw Error('Request identity differs');requests.push({code:source.code,requestId:source.requestId,requestDigest:source.digest,userId:source.userId,requestedRole:request.requestedRole,introduction:request.introduction,recordedAt:request.recordedAt,timeBasis:'requester-provided',state:'unreviewed',request});}catch{unavailableCount++;}
 }
 let reviewIncomplete=false;
 if(requests.length){const listing=await transport.decisions();if(!listing||!Array.isArray(listing.records)||listing.records.length>100)throw Error('Owner review listing unavailable or exceeds bounded limit');reviewIncomplete=listing.more===true;
  /** @type {Map<string,any[]>} */const decisions=new Map();
  for(const record of listing.records){
   try{const match=record.name.match(decisionName);if(!match||!(record.bytes instanceof Uint8Array)||record.bytes.length>8192||digest(record.bytes)!==match[2])throw Error('Review bytes differ');const value=JSON.parse(new TextDecoder().decode(record.bytes));const row=requests.find(r=>r.requestId===value.requestId&&r.userId===value.recipientUserId&&r.requestDigest===value.requestDigest);if(!row)continue;
    const normalized=buildJoinReview(row.request,value,{homeId:target.homeId,ownerUserId:target.ownerUserId,userId:access.userId,homeRevision:value.homeRevision,homeFileVersion:value.homeFileVersion,homeDigest:value.homeDigest,publicationDigest:value.publicationDigest,requestDigest:row.requestDigest},value.recordedAt);
    if(value.id!==match[1]||await joinIntentID(value)!==value.id||canonicalJSON(value)!==canonicalJSON(normalized))throw Error('Review identity differs');const old=decisions.get(row.code)??[];old.push(value);decisions.set(row.code,old);
   }catch{reviewIncomplete=true;}
  }
  for(const row of requests){const values=decisions.get(row.code)??[];const outcomes=new Set(values.map(v=>v.decision+':'+v.role));if(reviewIncomplete)row.state='review-unverified';else if(outcomes.size>1)row.state='conflicting-decisions';else if(values.length){const value=values.find(v=>v.homeRevision===access.home.revision&&v.homeFileVersion===access.file?.id&&v.homeDigest===digest(access.file?.text??''))??values[0];row.state=value.decision==='reject'?'rejected':access.home.members?.some((/** @type {any} */m)=>m.userId===row.userId&&m.role===value.role)?'role-recorded':value.homeRevision!==access.home.revision||value.homeFileVersion!==access.file?.id||value.homeDigest!==digest(access.file?.text??'')?'approval-needs-review':'approved-awaiting-application';}}
 }
 const after=incomingJoinCandidates(await transport.incoming(),target);if(canonicalJSON(before)!==canonicalJSON(after))throw Error('Incoming request access changed; refresh the inbox');
 return {status:'current-owner-inbox',requests:requests.map(({request,...row})=>row),attentionCount:requests.filter(r=>!['rejected','role-recorded'].includes(r.state)).length,more:before.sources.length>20,unavailableCount,unsupportedCount:before.unsupportedCount,reviewIncomplete,memberAccessVerified:false};
}
