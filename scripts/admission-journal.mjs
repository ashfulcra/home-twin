import {mkdirSync,lstatSync,readFileSync,writeFileSync,renameSync,rmdirSync,openSync,fsyncSync,closeSync} from 'node:fs';import {join,dirname} from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {canonicalJSON} from '../src/lib/home/canonical-json.js';import {buildAdmissionPacket} from '../src/lib/home/admission-packet.js';import {validHomeRoot} from '../src/lib/home/home-root.js';import {parseJoinCode,validateSharedJoinRequest,joinIntentID} from '../src/lib/home/joining.js';
/** @param {any} value */const hash=value=>createHash('sha256').update(canonicalJSON(value)).digest('hex');
/** @param {string} value */const bytesHash=value=>createHash('sha256').update(value).digest('hex');
/** Reject untrusted paths before any source read. @param {any} packet */
export function assertAdmissionScope(packet){
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;const sha=/^[a-f0-9]{64}$/;
 if(packet?.schema!=='home-twin-admission-packet/1'||packet.status!=='prepared-not-applied'||!uuid.test(packet.ownerUserId)||!uuid.test(packet.recipientUserId)||packet.ownerUserId===packet.recipientUserId||!uuid.test(packet.reviewId)||!sha.test(packet.reviewDigest)||!sha.test(packet.requestDigest)||!sha.test(packet.publicationDigest)||!sha.test(packet.baseline?.digest)||!validHomeRoot(packet.homeId,packet.baseline?.root)||!['viewer','contributor'].includes(packet.role))throw Error('Bounded exact owner admission packet required');
 if(packet.baseline.root+'/home.json'===packet.publicationPath)throw Error('A distinct private canonical root is required before household admission; preserve originals and review migration separately');
 if(packet.publicationPath!==`/shared/home-twin/${packet.homeId}/home.json`||packet.reviewPath!==`${packet.baseline.root}/join-decisions/${packet.reviewId}-${packet.reviewDigest}.json`)throw Error('Admission paths differ from home scope');
 const name=packet.requestPath?.split('/').at(-1);if(!name||!new RegExp(`^[a-f0-9-]{36}-${packet.requestDigest}\\.json$`).test(name)||packet.requestPath!==`/shared/home-twin/${packet.homeId}/join-requests/${name}`)throw Error('Bounded applicant request required');
 return parseJoinCode(`${packet.homeId}:${packet.recipientUserId}:${name.slice(0,36)}:${packet.requestDigest}`,{homeId:packet.homeId,ownerUserId:packet.ownerUserId});
}
/** Exact outgoing receipt is not proof of member delivery. Unknown shapes fail closed.
 * @param {any[]} shares @param {any} body */
export function exactAdmissionShare(shares,body){
 if(!Array.isArray(shares))throw Error('Outgoing grants unavailable');const matches=shares.filter(s=>s.datashare_name===body.datashare_name);if(matches.length>1)throw Error('Duplicate named grants need owner inspection');if(!matches.length)return null;const s=matches[0];
 if(typeof s.datashare_id!=='string'||!s.datashare_id||s.share_all_data!==false||s.fulcra_user_name!==body.fulcra_user_name||s.time_start!==null||s.time_end!==null||!Array.isArray(s.fulcra_data_types)||canonicalJSON(s.fulcra_data_types)!==canonicalJSON(body.fulcra_data_types)||!Array.isArray(s.permissions)||s.permissions.length!==1||s.permissions[0].allowed_fulcra_userid!==body.permissions[0].allowed_fulcra_userid||!Array.isArray(s.group_permissions)||s.group_permissions.length)throw Error('Named grant scope or recipient differs; inspect without widening or revoking');return s.datashare_id;
}
/** Current private state + same designated-maintainer lock; no implicit tool consent.
 * @param {string} directory @param {any} packet @param {any} transport @param {any} consent */
export async function runAdmission(directory,packet,transport,consent){
 const source=assertAdmissionScope(packet);if(consent?.ownerApproved!==true||consent.recipientUserId!==packet.recipientUserId||consent.publicationDigest!==packet.publicationDigest)throw Error('Specific owner-approved recipient and exact publication confirmation required');
 mkdirSync(directory,{recursive:true,mode:0o700});
 const privatePath=(/** @type {string} */p)=>{const st=lstatSync(p);if(st.isSymbolicLink()||(st.mode&0o077))throw Error('Private non-symlink admission state required');return st;};if(!privatePath(directory).isDirectory())throw Error('Private state directory required');
 const lock=join(directory,'.cycle.lock');try{mkdirSync(lock,{mode:0o700});}catch{throw Error('Maintainer lock occupied; inspect active/abandoned run, never steal');}
 const read=(/** @type {string} */p)=>{try{if(!privatePath(p).isFile())throw Error('Private state file required');return JSON.parse(readFileSync(p,'utf8'));}catch(e){if(e&&typeof e==='object'&&'code' in e&&e.code==='ENOENT')return null;throw e;}};
 const save=(/** @type {string} */p,/** @type {any} */v)=>{const temp=join(directory,'.admission-'+randomUUID()+'.json');writeFileSync(temp,JSON.stringify(v,null,2),{flag:'wx',mode:0o600});const fd=openSync(temp,'r');try{fsyncSync(fd);}finally{closeSync(fd);}renameSync(temp,p);const parent=openSync(dirname(p),'r');try{fsyncSync(parent);}finally{closeSync(parent);}};
 try{
  const scope={homeId:packet.homeId,principalId:packet.ownerUserId,root:packet.baseline.root};const checkpoint=read(join(directory,'checkpoint.json'));if(!checkpoint||checkpoint.schema!=='home-twin-checkpoint/1'||Object.entries(scope).some(([k,v])=>checkpoint[k]!==v))throw Error('Existing maintainer state scope differs');
  const publicationState=read(join(directory,'publication.json'));if(publicationState&&(Object.entries(scope).some(([k,v])=>publicationState[k]!==v)||!['pending','confirmed'].includes(publicationState.status)||publicationState.status==='pending'))throw Error('Resolve pending publication before admission');
  const intents=join(directory,'admissions');mkdirSync(intents,{recursive:true,mode:0o700});if(!privatePath(intents).isDirectory())throw Error('Private intent directory required');
  const pointerPath=join(directory,'admission.json');let pointer=read(pointerPath);let intent;
  if(pointer){const {integrity,...body}=pointer;if(hash(body)!==integrity||Object.entries(scope).some(([k,v])=>pointer[k]!==v)||!['pending','confirmed'].includes(pointer.status)||! /^[a-f0-9]{64}$/.test(pointer.intentId))throw Error('Admission pointer integrity or scope differs');if(!pointer.operations||Object.values(pointer.operations).some(v=>!['in-flight','confirmed'].includes(v)))throw Error('Admission operation state unknown; preserve and inspect');}
  if(pointer?.status==='pending'||pointer?.packetDigest===hash(packet)){
   intent=read(join(intents,pointer.intentId+'.json'));if(!intent)throw Error('Pending immutable intent missing');const {intentId,...body}=intent;if(hash(body)!==intentId||intentId!==pointer.intentId)throw Error('Admission intent integrity differs');if(hash(packet)!==intent.packetDigest)throw Error('Resolve prior pending admission before a different packet');
  }else{
   const input=await transport.readInputs(packet);if(input.principalId!==packet.ownerUserId||input.home.ownerUserId!==packet.ownerUserId||input.home.id!==packet.homeId||input.fileVersion!==packet.baseline.fileVersion||bytesHash(input.rawHome)!==packet.baseline.digest||canonicalJSON(input.home)!==canonicalJSON(JSON.parse(input.rawHome)))throw Error('Current owner or admission baseline differs');
   const priorPublication=await transport.readFile(packet.publicationPath);if(priorPublication!==null){const prior=JSON.parse(priorPublication);if(prior.id!==packet.homeId||prior.ownerUserId!==packet.ownerUserId)throw Error('Current publication belongs to another home');}
   const target={...input.home,members:packet.publication.members,revision:input.home.revision+1};const body={schema:'home-twin-admission-intent/1',...scope,packet,packetDigest:hash(packet),base:{home:input.home,text:input.rawHome,fileVersion:input.fileVersion},targetText:JSON.stringify(target),priorPublication};intent={...body,intentId:hash(body)};
   await inspect(intent,input);exactAdmissionShare(await transport.listShares(),packet.shareBody);
   const path=join(intents,intent.intentId+'.json');const old=read(path);if(old&&canonicalJSON(old)!==canonicalJSON(intent))throw Error('Immutable admission intent collision');if(!old)save(path,intent);
   pointer={...scope,intentId:intent.intentId,packetDigest:intent.packetDigest,status:'pending',operations:{}};persist();
  }
  function persist(){const {integrity,...body}=pointer;pointer={...body,integrity:hash(body)};save(pointerPath,pointer);}
  async function inspect(/** @type {any} */saved,/** @type {any} */supplied=undefined){
   const input=supplied??await transport.readInputs(packet);if(input.principalId!==saved.principalId||input.home?.ownerUserId!==saved.principalId||input.home?.id!==saved.homeId||bytesHash(input.rawRequest)!==packet.requestDigest||bytesHash(input.rawReview)!==packet.reviewDigest||canonicalJSON(JSON.parse(input.rawRequest))!==canonicalJSON(input.request)||canonicalJSON(JSON.parse(input.rawReview))!==canonicalJSON(input.review))throw Error('Current owner, source request or review differs');
   const request=validateSharedJoinRequest(input.request,source,{homeId:packet.homeId,ownerUserId:packet.ownerUserId});if(await joinIntentID(request)!==request.id)throw Error('Applicant intent identity differs');
   const context={home:saved.base.home,root:saved.root,userId:input.principalId,homeId:saved.homeId,ownerUserId:saved.principalId,homeRevision:saved.base.home.revision,homeFileVersion:saved.base.fileVersion,homeDigest:bytesHash(saved.base.text),requestDigest:bytesHash(input.rawRequest),publicationDigest:packet.publicationDigest};
   const fresh=await buildAdmissionPacket(input.review,request,context,packet.publication);if(canonicalJSON(fresh)!==canonicalJSON(packet))throw Error('Exact approval packet differs');
   if(input.rawHome===saved.targetText)return 'target';if(input.rawHome!==saved.base.text||input.fileVersion!==saved.base.fileVersion)throw Error('Canonical baseline changed; preserve intent and inspect');return 'base';
  }
  if(intent.schema!=='home-twin-admission-intent/1'||intent.packetDigest!==hash(packet)||canonicalJSON(intent.packet)!==canonicalJSON(packet)||intent.base.fileVersion!==packet.baseline.fileVersion||bytesHash(intent.base.text)!==packet.baseline.digest||canonicalJSON(JSON.parse(intent.base.text))!==canonicalJSON(intent.base.home)||intent.targetText!==JSON.stringify({...intent.base.home,members:packet.publication.members,revision:intent.base.home.revision+1}))throw Error('Admission intent baseline/target integrity differs');
  await inspect(intent);exactAdmissionShare(await transport.listShares(),packet.shareBody);
  const steps=[['canonical-backup',`${scope.root}/history/${bytesHash(intent.base.text)}.json`,intent.base.text],...(intent.priorPublication===null?[]:[['publication-backup',`${scope.root}/history/${bytesHash(intent.priorPublication)}.json`,intent.priorPublication]]),['canonical',`${scope.root}/home.json`,intent.targetText],['publication',packet.publicationPath,JSON.stringify(packet.publication)]];
  for(const [name,path,text] of steps){
   const existing=await transport.readFile(path);if(existing===text){pointer.operations[name]='confirmed';persist();continue;}
   if(pointer.operations[name])throw Error(`Admission ${name} result uncertain or drifted; preserve intent and resolve exact readback, never blindly repeat`);
   if(name.endsWith('backup')&&existing!==null)throw Error('Prior snapshot backup collision');if(name==='publication'&&existing!==intent.priorPublication)throw Error('Publication baseline changed');
   const before=async()=>{const state=await inspect(intent);if(name==='canonical'&&state!=='base')throw Error('Canonical already changed');if(name==='publication'&&state!=='target')throw Error('Canonical membership is not confirmed');if(await transport.readFile(path)!==existing)throw Error('File changed before commit');};
   await before();pointer.operations[name]='in-flight';persist();try{await transport.writeFile(path,text,before);}catch{/* Commit may have succeeded: only exact readback decides. */}
   if(await transport.readFile(path)!==text)throw Error(`Admission ${name} result uncertain; preserve intent and resolve readback`);pointer.operations[name]='confirmed';persist();
  }
  const beforeGrant=async()=>{if(await inspect(intent)!=='target'||await transport.readFile(packet.publicationPath)!==JSON.stringify(packet.publication))throw Error('Published admission contents drifted before grant');};await beforeGrant();
  let grantId=exactAdmissionShare(await transport.listShares(),packet.shareBody);
  if(!grantId){if(pointer.operations.grant)throw Error('Admission grant result uncertain or revoked; inspect outgoing grants, never blindly create again');pointer.operations.grant='in-flight';persist();try{await beforeGrant();await transport.createShare(packet.shareBody);}catch{/* No retry of an uncertain grant create. */}grantId=exactAdmissionShare(await transport.listShares(),packet.shareBody);if(!grantId)throw Error('Admission grant result uncertain; inspect outgoing grant readback before any fresh create');}
  await beforeGrant();pointer.operations.grant='confirmed';pointer.status='confirmed';pointer.result={status:'outgoing-confirmed-member-unverified',intentId:intent.intentId,homeId:scope.homeId,recipientUserId:packet.recipientUserId,revision:packet.publication.revision,datashareId:grantId,memberAccessVerified:false};persist();return pointer.result;
 }finally{rmdirSync(lock);}
}

/** Routine publication must not bypass pending/corrupt admission state.
 * @param {any} pointer @param {any} intent */
export function assertConfirmedAdmissionState(pointer,intent){
 if(pointer?.status==='pending')throw Error('Resolve pending admission before routine publication');
 if(!pointer||pointer.status!=='confirmed')throw Error('Admission state unknown; preserve and inspect');
 const {integrity,...body}=pointer;const {intentId,...payload}=intent??{};
 if(hash(body)!==integrity||!intent||hash(payload)!==intentId||intentId!==pointer.intentId||intent.schema!=='home-twin-admission-intent/1'||pointer.packetDigest!==intent.packetDigest||hash(intent.packet)!==intent.packetDigest||['homeId','principalId','root'].some(k=>pointer[k]!==intent[k])||['canonical-backup','canonical','publication','grant',...(intent.priorPublication===null?[]:['publication-backup'])].some(k=>pointer.operations?.[k]!=='confirmed'))throw Error('Admission confirmed state integrity differs; preserve and inspect');
 assertAdmissionScope(intent.packet);
}
