import {mkdirSync,lstatSync,readFileSync,writeFileSync,renameSync,rmdirSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {join,dirname} from 'node:path';import {randomUUID} from 'node:crypto';
import {canonicalJSON} from '../src/lib/home/canonical-json.js';
import {assertRefreshScope,buildHouseholdRefresh,validateRefreshShares} from '../src/lib/home/household-refresh.js';
import {refreshHash as hash,refreshBytesHash as bytesHash,assertConfirmedRefresh,assertRefreshPrior} from './household-refresh-state.mjs';
import {assertConfirmedAdmissionState} from './admission-journal.mjs';

/** Existing maintainer state; no grant or canonical write method is used.
 * @param {string} directory @param {any} packet @param {any} transport @param {any} consent */
export async function runHouseholdRefresh(directory,packet,transport,consent){
 assertRefreshScope(packet);
 if(consent?.ownerApproved!==true||consent.publicationDigest!==packet.publicationDigest||consent.membersDigest!==packet.membersDigest)throw Error('Exact owner content and current members approval/consent required');
 const privatePath=(/** @type {string} */p)=>{const st=lstatSync(p);if(st.isSymbolicLink()||(st.mode&0o077))throw Error('Private non-symlink refresh state required');return st;};
 if(!privatePath(directory).isDirectory())throw Error('Existing private maintainer state required');
 const lock=join(directory,'.cycle.lock');try{mkdirSync(lock,{mode:0o700});}catch{throw Error('Maintainer lock occupied; never steal or bypass');}
 const read=(/** @type {string} */p)=>{try{if(!privatePath(p).isFile())throw Error('Private state file required');return JSON.parse(readFileSync(p,'utf8'));}catch(e){if(e&&typeof e==='object'&&'code' in e&&e.code==='ENOENT')return null;throw e;}};
 const save=(/** @type {string} */path,/** @type {any} */value)=>{const temp=join(directory,'.refresh-'+randomUUID()+'.json');writeFileSync(temp,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});const fd=openSync(temp,'r');try{fsyncSync(fd);}finally{closeSync(fd);}renameSync(temp,path);const parent=openSync(dirname(path),'r');try{fsyncSync(parent);}finally{closeSync(parent);}};
 const scope={homeId:packet.homeId,principalId:packet.ownerUserId,root:packet.baseline.root};
 try{
  const checkpoint=read(join(directory,'checkpoint.json'));if(checkpoint?.schema!=='home-twin-checkpoint/1'||Object.entries(scope).some(([k,v])=>checkpoint[k]!==v))throw Error('Existing maintainer checkpoint scope differs');
  const publication=read(join(directory,'publication.json'));if(publication&&(publication.status!=='confirmed'||Object.entries(scope).some(([k,v])=>publication[k]!==v)))throw Error('Resolve pending or unknown routine publication scope');
  const admission=read(join(directory,'admission.json'));if(admission){if(admission.status==='pending')throw Error('Resolve pending admission before refresh');if(!/^[a-f0-9]{64}$/.test(admission.intentId??''))throw Error('Admission state unknown; preserve and inspect');assertConfirmedAdmissionState(admission,read(join(directory,'admissions',admission.intentId+'.json')));if(Object.entries(scope).some(([k,v])=>admission[k]!==v))throw Error('Admission state scope differs');}
  const path=join(directory,'household-refresh.json'),intents=join(directory,'household-refresh');mkdirSync(intents,{mode:0o700,recursive:true});if(!privatePath(intents).isDirectory())throw Error('Private refresh intents required');
  let pointer=read(path);
  /** @type {any} */
  let intent;
  if(pointer){const {integrity,...body}=pointer;if(pointer.schema!=='home-twin-refresh-state/1'||hash(body)!==integrity||Object.entries(scope).some(([k,v])=>pointer[k]!==v)||!['pending','confirmed'].includes(pointer.status)||!/^[a-f0-9]{64}$/.test(pointer.intentId)||!pointer.operations||Object.entries(pointer.operations).some(([k,v])=>!['backup','publication'].includes(k)||!['in-flight','confirmed'].includes(v)))throw Error('Refresh pointer state integrity/scope differs');if(pointer.status==='confirmed')assertConfirmedRefresh(pointer,read(join(intents,pointer.intentId+'.json')));}
  if(pointer?.status==='pending'||pointer?.packetDigest===hash(packet)){
   intent=read(join(intents,pointer.intentId+'.json'));if(!intent||hash(intent.packet)!==hash(packet))throw Error('Resolve prior refresh before a different packet');const {intentId,...payload}=intent;if(hash(payload)!==intentId||intentId!==pointer.intentId)throw Error('Refresh immutable intent integrity differs');
  }else{
   if(pointer)assertConfirmedRefresh(pointer,read(join(intents,pointer.intentId+'.json')));
   const receipts=await inspect();const priorText=await transport.readFile(packet.publicationPath);if(typeof priorText!=='string')throw Error('Current household publication unavailable; restore access before refresh');const prior=JSON.parse(priorText);if(prior.id!==scope.homeId||prior.ownerUserId!==scope.principalId)throw Error('Publication belongs to another home');
   const targetText=JSON.stringify(packet.publication);if(priorText===targetText)return {status:'publication-current-member-unverified',memberAccessVerified:false,noChange:true};
   if(!Number.isSafeInteger(prior.revision)||prior.revision<1||prior.revision>=packet.baseline.revision)throw Error('Publication revision is newer, malformed or divergent; inspect before any refresh');
   const payload={schema:'home-twin-refresh-intent/1',...scope,packet,packetDigest:hash(packet),priorText,targetText,receipts};intent={...payload,intentId:hash(payload)};
   const existing=read(join(intents,intent.intentId+'.json'));if(existing&&canonicalJSON(existing)!==canonicalJSON(intent))throw Error('Refresh immutable intent collision');if(!existing)save(join(intents,intent.intentId+'.json'),intent);
   pointer={schema:'home-twin-refresh-state/1',...scope,intentId:intent.intentId,packetDigest:intent.packetDigest,status:'pending',operations:{}};persist();
  }
  if(intent.schema!=='home-twin-refresh-intent/1'||intent.packetDigest!==hash(packet)||Object.entries(scope).some(([k,v])=>intent[k]!==v)||intent.targetText!==JSON.stringify(packet.publication)||bytesHash(intent.targetText)!==packet.publicationDigest||typeof intent.priorText!=='string')throw Error('Refresh intent target/scope differs');
  assertRefreshPrior(intent);
  await inspect(intent.receipts);
  await commit('backup',`${scope.root}/history/${bytesHash(intent.priorText)}.json`,intent.priorText,null);
  await commit('publication',packet.publicationPath,intent.targetText,intent.priorText);
  await inspect(intent.receipts);if(await transport.readFile(packet.publicationPath)!==intent.targetText)throw Error('Refresh final readback differs; preserve intent');
  pointer.status='confirmed';pointer.result={status:'publication-confirmed-member-unverified',intentId:intent.intentId,revision:packet.baseline.revision,memberAccessVerified:false};persist();return pointer.result;
  function persist(){const {integrity,...body}=pointer;pointer={...body,integrity:hash(body)};save(path,pointer);}
  async function inspect(/** @type {any} */expected=undefined){
   const input=await transport.readInputs();if(input.principalId!==scope.principalId||input.home?.ownerUserId!==scope.principalId||input.home?.id!==scope.homeId||input.fileVersion!==packet.baseline.fileVersion||bytesHash(input.rawHome)!==packet.baseline.digest)throw Error('Current owner/canonical baseline differs');
   const fresh=await buildHouseholdRefresh(input.home,{userId:input.principalId,root:scope.root,fileVersion:input.fileVersion,rawHome:input.rawHome});if(canonicalJSON(fresh)!==canonicalJSON(packet))throw Error('Exact reviewed household publication or members changed');
   const receipts=validateRefreshShares(await transport.listShares(),packet);if(expected&&canonicalJSON(receipts)!==canonicalJSON(expected))throw Error('Outgoing grant receipts changed; inspect current access');return receipts;
  }
  async function commit(/** @type {string} */name,/** @type {string} */destination,/** @type {string} */text,/** @type {string|null} */prior){
   await inspect(intent.receipts);const current=await transport.readFile(destination);
   if(current===text){pointer.operations[name]='confirmed';persist();return;}
   if(pointer.operations[name])throw Error('Refresh result uncertain; preserve intent and retry readback only');
   if(current!==prior)throw Error('Publication/backup baseline changed; preserve and inspect');
   pointer.operations[name]='in-flight';persist();
   try{await transport.writeFile(destination,text,async()=>{await inspect(intent.receipts);if(await transport.readFile(destination)!==prior)throw Error('Commit baseline changed');});}catch{/* Current readback, not an exception, determines outcome. */}
   if(await transport.readFile(destination)!==text)throw Error('Refresh result uncertain; preserve intent and retry readback only');
   pointer.operations[name]='confirmed';persist();
  }
 }finally{rmdirSync(lock);}
}
