import {assertAccessWritersConfirmed,readPrivateWriterState} from './access-guards.mjs';
import {assertConfirmedAdmissionState} from './admission-journal.mjs';
import {readJoinOutcome} from './join-outcome.mjs';
import {join} from 'node:path';import {createHash} from 'node:crypto';
import {createAdmissionClient} from './admission-client.mjs';import {applyWebAdmission} from './web-admission.mjs';import {runAutomaticJoin} from './automatic-join.mjs';import {accessFulcraClient,automaticJoinTransport} from './access-fulcra-client.mjs';
import {accessLock,readAccessState,saveAccessState} from './access-state.mjs';import {exactAdmissionShare} from './admission-journal.mjs';
import {parseJoinCode,validateSharedJoinRequest,joinIntentID,buildJoinReview} from '../src/lib/home/joining.js';import {buildAdmissionPacket} from '../src/lib/home/admission-packet.js';import {householdPublication,prepareHouseholdBase} from '../src/lib/home/household-publication.js';import {validHomeRoot} from '../src/lib/home/home-root.js';
const hash=(/** @type {string} */text)=>createHash('sha256').update(text).digest('hex');
const decisionRE=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[a-f0-9]{64}$/;
/** Bounded deployment target is configured by the operator, never by the applicant.
 * No caller token is saved. Ordinary backend code, no AI agent required. */
/** @param {any} config @param {any} input @param {{client?:any,admissionTransport?:any}} [options] */
export async function runAccessWorkflow(config,input,options={}){
 const target=config.homes?.find((/** @type {any} */h)=>h.homeId===input?.homeId);
 if(!target||!validHomeRoot(target.homeId,target.root)||target.root==='/shared/home-twin/'+target.homeId)throw Error('Configured private canonical home required');
 if(input.ownerUserId!==target.ownerUserId)throw Error('Home owner configuration differs between the app and access service');
 if(!['request','apply'].includes(input?.action))throw Error('Unknown access action');
 const client=options.client??accessFulcraClient(input.token),userId=await client.principal();
 if(typeof userId!=='string'||!/^[a-f0-9-]{36}$/.test(userId))throw Error('Current Fulcra account required');
 if(input.action==='request'){
  if(userId===target.ownerUserId)throw Error('The owner already has access');
  const result=await runAutomaticJoin(join(target.stateDirectory,'join-applicants',userId),target,automaticJoinTransport(client,target,userId));return {...result,status:await readJoinOutcome(client,target,userId,result.requestId)};
 }
 if(userId!==target.ownerUserId)throw Error('Only the configured current owner can apply a decision');
 const code=input.reviewCode;if(typeof code!=='string'||!decisionRE.test(code))throw Error('Exact review code required');
 const raw=await client.file(target.root+'/join-decisions/'+code+'.json',undefined,8192);if(!raw||hash(raw.text)!==code.slice(-64))throw Error('Exact owner decision unavailable');
 const review=JSON.parse(raw.text);if(review.id!==code.slice(0,36)||review.authorUserId!==userId||review.ownerUserId!==userId||review.homeId!==target.homeId||await joinIntentID(review)!==review.id)throw Error('Owner decision identity differs');
 // An older browser decision must never reapply its superseded role. Verify
 // the newer immutable, confirmed admission for this exact recipient read-only.
 if(review.decision==='approve'){
  const confirmed=await accessLock(target.stateDirectory,async()=>{
   const pointer=readPrivateWriterState(join(target.stateDirectory,'admission.json'));
   if(!pointer||pointer.status!=='confirmed')return null;
   const saved=readPrivateWriterState(join(target.stateDirectory,'admissions',pointer.intentId+'.json'));
   assertConfirmedAdmissionState(pointer,saved);
   if(saved.packet.recipientUserId!==review.recipientUserId||saved.packet.reviewId===review.id||saved.packet.baseline.revision<=review.homeRevision)return null;
   assertAccessWritersConfirmed(target.stateDirectory,target);
   if(saved.homeId!==target.homeId||saved.principalId!==userId||saved.root!==target.root)throw Error('Current admission scope differs');
   const home=await client.file(target.root+'/home.json'),publication=await client.file(saved.packet.publicationPath);
   if(home?.text!==saved.targetText||publication?.text!==JSON.stringify(saved.packet.publication))throw Error('Completed admission contents changed; inspect current access');
   const grant=exactAdmissionShare(await client.listShares(),saved.packet.shareBody);
   if(!grant||grant!==pointer.result?.datashareId)throw Error('Completed admission share changed; inspect current access');
   return {...pointer.result,approvedRole:saved.packet.role,supersededSavedDecision:true};
  });
  if(confirmed)return confirmed;
 }
 const source=parseJoinCode(review.homeId+':'+review.recipientUserId+':'+review.requestId+':'+review.requestDigest,target);
 const original=await client.file(source.path,source.userId,8192);if(!original||hash(original.text)!==source.digest)throw Error('Current exact applicant request unavailable');
 const request=validateSharedJoinRequest(JSON.parse(original.text),source,target);if(await joinIntentID(request)!==request.id||JSON.stringify(request)!==original.text)throw Error('Applicant request identity differs');
 async function baseline(){const homeFile=await client.file(target.root+'/home.json');if(!homeFile)throw Error('Current home unavailable');const home=JSON.parse(homeFile.text);if(home.ownerUserId!==userId||home.id!==target.homeId)throw Error('Current home ownership changed');
  return {home,root:target.root,userId,homeId:target.homeId,ownerUserId:userId,homeRevision:home.revision,homeFileVersion:homeFile.id,homeDigest:hash(homeFile.text),requestDigest:source.digest,publicationDigest:review.publicationDigest};
 }
 let result;
 if(review.decision==='approve'){
  result=await applyWebAdmission(target.stateDirectory,code,async()=>{const context=await baseline(),publication=householdPublication(await prepareHouseholdBase(context.home),{userId:review.recipientUserId,role:review.role});return buildAdmissionPacket(review,request,context,publication);},options.admissionTransport??((/** @type {any} */packet)=>createAdmissionClient(packet,{token:input.token})));
  if(result.status==='review-required')return {...result,requestCode:source.homeId+':'+source.userId+':'+source.requestId+':'+source.digest};
 }else if(review.decision==='reject'){
  await accessLock(target.stateDirectory,async()=>{assertAccessWritersConfirmed(target.stateDirectory,target);const context=await baseline();
   if(context.home.members?.some((/** @type {any} */m)=>m.userId===source.userId))throw Error('This account is already a member. Declining a request cannot revoke home access.');
   const expected=buildJoinReview(request,review,context,review.recordedAt);if(JSON.stringify(expected)!==JSON.stringify(review))throw Error('Rejection baseline changed; reload the request and review it again');
  });result={status:'rejection-recorded',homeId:target.homeId,recipientUserId:review.recipientUserId};
 }else throw Error('Unsupported decision');
 // A separate exact outcome file allows the applicant to read a decline using
 // their own token. Its share grants no home access and excludes private review.
 await accessLock(target.stateDirectory,async()=>{
  assertAccessWritersConfirmed(target.stateDirectory,target);
  const folder=join(target.stateDirectory,'join-outcomes'),local=join(folder,code+'.json');let state=readAccessState(local);
  const value={schema:'home-twin-join-outcome/1',homeId:target.homeId,ownerUserId:userId,recipientUserId:source.userId,requestId:source.requestId,decision:review.decision,role:review.role,reviewId:review.id};
  const path='/shared/home-twin/'+target.homeId+'/join-status/'+source.requestId+'-'+code+'.json',text=JSON.stringify(value);
  const body={datashare_name:'home-twin-outcome:'+target.homeId+':'+review.id,fulcra_user_name:userId,time_start:null,time_end:null,fulcra_data_types:['file:'+path],share_all_data:false,permissions:[{allowed_fulcra_userid:source.userId}],group_permissions:[]};
  if(!state){state={schema:'home-twin-outcome-journal/1',path,text,body,operations:{}};saveAccessState(local,state);}else if(state.path!==path||state.text!==text||JSON.stringify(state.body)!==JSON.stringify(body))throw Error('Outcome scope differs');
  const current=await baseline();if(review.decision==='reject'){if(current.home.members?.some((/** @type {any} */m)=>m.userId===source.userId))throw Error('This account is now a member; a rejection outcome would conflict with its access');if(JSON.stringify(buildJoinReview(request,review,current,review.recordedAt))!==JSON.stringify(review))throw Error('Rejection baseline changed before outcome; review again');}if(review.decision==='approve'&&!current.home.members?.some((/** @type {any} */m)=>m.userId===source.userId&&m.role===review.role))throw Error('Current membership changed before outcome');
  let bytes=(await client.file(path,undefined,8192))?.text??null;
  if(bytes!==text){if(bytes!==null||state.operations.file)throw Error('Outcome upload uncertain or drifted; preserve and check readback');state.operations.file='in-flight';saveAccessState(local,state);try{await client.write(path,text);}catch{}bytes=(await client.file(path,undefined,8192))?.text??null;if(bytes!==text)throw Error('Outcome upload uncertain; retry same decision');}
  state.operations.file='confirmed';saveAccessState(local,state);
  let grant=exactAdmissionShare(await client.listShares(),body);if(!grant){if(state.operations.grant)throw Error('Outcome share uncertain or revoked; inspect exact readback');state.operations.grant='in-flight';saveAccessState(local,state);try{await client.createShare(body);}catch{}grant=exactAdmissionShare(await client.listShares(),body);if(!grant)throw Error('Outcome share uncertain; retry same decision');}
  state.operations.grant='confirmed';saveAccessState(local,state);
 });
 return result;
}
