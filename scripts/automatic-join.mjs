import {join} from 'node:path';import {createHash} from 'node:crypto';
import {createJoinRequest,joinIntentID,parseJoinCode,validateSharedJoinRequest} from '../src/lib/home/joining.js';
import {exactAdmissionShare} from './admission-journal.mjs';
import {accessLock,readAccessState,saveAccessState,privateDirectory} from './access-state.mjs';
/** @param {string} text */
const digest=text=>createHash('sha256').update(text).digest('hex');
/** Persistent per-applicant request; no token stored and no home write.
 * The caller has chosen to request access through the named home's sign-in.
 * @param {string} directory @param {any} target @param {any} transport */
export async function runAutomaticJoin(directory,target,transport){
 const userId=await transport.principal();if(userId===target.ownerUserId)throw Error('The owner already has access');parseJoinCode(target.homeId+':'+userId+':11111111-1111-4111-8111-111111111111:'+ 'a'.repeat(64),target);
 return accessLock(directory,async()=>{
  const path=join(directory,'automatic-request.json');let state=readAccessState(path);
  if(state&&(state.homeId!==target.homeId||state.ownerUserId!==target.ownerUserId||state.userId!==userId))throw Error('Automatic request state scope differs');
  if(!state){
   const originals=await transport.requests();if(!Array.isArray(originals)||originals.length>100)throw Error('Existing request discovery incomplete');
   /** @type {any[]} */const valid=[];for(const raw of originals){try{const source=parseJoinCode(target.homeId+':'+userId+':'+raw.id+':'+digest(JSON.stringify(raw)),target);const value=validateSharedJoinRequest(raw,source,target);if(await joinIntentID(value)!==value.id||JSON.stringify(value)!==JSON.stringify(raw))throw Error();valid.push(value);}catch{throw Error('Existing request needs review; preserve its original before requesting again');}}
   valid.sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt)||a.id.localeCompare(b.id));
   let request=valid[0];if(!request){request=createJoinRequest({id:'11111111-1111-4111-8111-111111111111',requestedRole:'viewer',introduction:'Requested access by signing in to this home.'},target,userId,new Date().toISOString());request.id=await joinIntentID(request);}
   const text=JSON.stringify(request),requestDigest=digest(text),requestPath='/shared/home-twin/'+target.homeId+'/join-requests/'+request.id+'-'+requestDigest+'.json';
   const shareBody={datashare_name:'home-twin-request:'+target.homeId+':'+request.id,fulcra_user_name:userId,time_start:null,time_end:null,fulcra_data_types:['file:'+requestPath],share_all_data:false,permissions:[{allowed_fulcra_userid:target.ownerUserId}],group_permissions:[]};
   state={schema:'home-twin-auto-request/1',homeId:target.homeId,ownerUserId:target.ownerUserId,userId,request,text,requestPath,code:target.homeId+':'+userId+':'+request.id+':'+requestDigest,shareBody,operations:{}};saveAccessState(path,state);
  }
  const source=parseJoinCode(state.code,target),request=validateSharedJoinRequest(state.request,source,target);
  if(await joinIntentID(request)!==request.id||JSON.stringify(request)!==state.text||digest(state.text)!==source.digest||source.path!==state.requestPath||state.shareBody.permissions?.[0]?.allowed_fulcra_userid!==target.ownerUserId||state.shareBody.fulcra_data_types?.[0]!=='file:'+state.requestPath)throw Error('Automatic request integrity differs');
  const persist=()=>saveAccessState(path,state);
  let current=await transport.readFile(state.requestPath);
  if(current!==state.text){
   if(current!==null)throw Error('Existing request bytes differ; preserve and inspect');
   if(state.operations.file)throw Error('Request upload uncertain; retry exact readback, never blindly write again');
   state.operations.file='in-flight';persist();try{await transport.writeFile(state.requestPath,state.text);}catch{/* Readback is the only confirmation. */}
   current=await transport.readFile(state.requestPath);if(current!==state.text)throw Error('Request upload uncertain; retry exact readback');
  }
  state.operations.file='confirmed';persist();
  let grant=exactAdmissionShare(await transport.listShares(),state.shareBody);
  if(!grant){if(state.operations.grant)throw Error('Request share uncertain or revoked; inspect exact outgoing grant before retry');state.operations.grant='in-flight';persist();try{await transport.createShare(state.shareBody);}catch{/* Never repeat an unknown grant create. */}grant=exactAdmissionShare(await transport.listShares(),state.shareBody);if(!grant)throw Error('Request share uncertain; retry exact outgoing readback');}
  state.operations.grant='confirmed';persist();
  return {status:'pending-approval',requestId:request.id,requestPath:state.requestPath,code:state.code,requestedRole:request.requestedRole,recordedAt:request.recordedAt};
 });
}
