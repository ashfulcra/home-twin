import {mkdirSync,lstatSync,readFileSync,writeFileSync,renameSync,rmdirSync} from 'node:fs';import {join} from 'node:path';import {randomUUID,createHash} from 'node:crypto';
import {canonicalJSON} from '../src/lib/home/canonical-json.js';
import {assertConfirmedAdmissionState} from './admission-journal.mjs';
import {assertConfirmedRefresh} from './household-refresh-state.mjs';
import {buildPublicationIntent,executePublication} from './maintainer-publish.mjs';
/** @param {string} path */
function privatePath(path){const st=lstatSync(path);if(st.isSymbolicLink()||(st.mode&0o077))throw Error('Private publication state required');return st;}
/** A completed pointer is reusable only with its retained immutable proof.
 * @param {any} pointer @param {any} intent */
export function assertConfirmedPublicationState(pointer,intent){
 if(!pointer||pointer.status!=='confirmed'||!intent||typeof intent!=='object'||Array.isArray(intent))throw Error('Confirmed publication intent unavailable; preserve pointer');
 const {intentId,...body}=intent;
 const hash=(/** @type {any} */x)=>createHash('sha256').update(canonicalJSON(x)).digest('hex');
 if(!/^[a-f0-9]{64}$/.test(intentId)||pointer.intentId!==intentId||hash(body)!==intentId||!['home-twin-publication/1','home-twin-model-publication/1'].includes(intent.schema)||['homeId','principalId','root'].some(k=>pointer[k]!==intent[k])||hash(intent.base)!==intent.baseDigest||hash(intent.target)!==intent.targetDigest||pointer.result?.intentId!==intentId||pointer.result?.revision!==intent.target?.revision||!(pointer.result?.confirmed===true||pointer.result?.status==='model-applied'))throw Error('Confirmed publication integrity differs; preserve pointer');
}
/** Same inspected-lock recovery policy as cycle journal. @param {string} directory @param {any} transport */
export async function runPublication(directory,transport){
 mkdirSync(directory,{recursive:true,mode:0o700});if(!privatePath(directory).isDirectory())throw Error('State directory required');
 const lock=join(directory,'.cycle.lock');try{mkdirSync(lock,{mode:0o700});}catch{throw Error('Cycle lock occupied; inspect prior process before abandoned-lock recovery');}
 const save=(/** @type {string} */ path,/** @type {any} */ value)=>{const tmp=join(directory,'.publication-'+randomUUID()+'.json');writeFileSync(tmp,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});renameSync(tmp,path);};
 const read=(/** @type {string} */ path)=>{try{if(!privatePath(path).isFile())throw Error('State file required');const value=JSON.parse(readFileSync(path,'utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Present publication state is corrupt; preserve and inspect');return value;}catch(e){if(e&&typeof e==='object'&&'code' in e&&e.code==='ENOENT')return null;throw e;}};
 try{
  const refresh=read(join(directory,'household-refresh.json'));if(refresh){if(refresh.status==='pending')throw Error('Resolve pending household refresh before routine publication');if(!/^[a-f0-9]{64}$/.test(refresh.intentId??''))throw Error('Household refresh state unknown; preserve and inspect');assertConfirmedRefresh(refresh,read(join(directory,'household-refresh',refresh.intentId+'.json')));}
  const admission=read(join(directory,'admission.json'));if(admission){if(admission.status==='pending')throw Error('Resolve pending admission before routine publication');if(!/^[a-f0-9]{64}$/.test(admission.intentId??''))throw Error('Admission state unknown; preserve and inspect');assertConfirmedAdmissionState(admission,read(join(directory,'admissions',admission.intentId+'.json')));}
  const pointerPath=join(directory,'publication.json');const pointer=read(pointerPath);const current=await transport.read();if(admission&&(admission.homeId!==current.home.id||admission.principalId!==current.principalId||admission.root!==current.root))throw Error('Admission state scope differs from current routine publication');if(refresh&&(refresh.homeId!==current.home.id||refresh.principalId!==current.principalId||refresh.root!==current.root))throw Error('Refresh state scope differs from routine publication');
  if(pointer&&(pointer.homeId!==current.home.id||pointer.principalId!==current.principalId||pointer.root!==current.root||!['pending','confirmed'].includes(pointer.status)))throw Error('Publication state scope mismatch');
  if(pointer?.status==='confirmed'){if(!/^[a-f0-9]{64}$/.test(pointer.intentId))throw Error('Confirmed publication pointer unknown');assertConfirmedPublicationState(pointer,read(join(directory,'publications',pointer.intentId+'.json')));}
  const intents=join(directory,'publications');mkdirSync(intents,{recursive:true,mode:0o700});if(!privatePath(intents).isDirectory())throw Error('Intent directory required');
  let intent;
  if(pointer?.status==='pending'){
   if(!/^[a-f0-9]{64}$/.test(pointer.intentId))throw Error('Invalid pending intent');intent=read(join(intents,pointer.intentId+'.json'));if(!intent||intent.intentId!==pointer.intentId)throw Error('Pending intent missing or mismatched; preserve files');
  }else{
   intent=buildPublicationIntent(current);if(!intent)return null;
   const path=join(intents,intent.intentId+'.json');const existing=read(path);if(existing&&JSON.stringify(existing)!==JSON.stringify(intent))throw Error('Immutable intent collision');if(!existing)save(path,intent);
   save(pointerPath,{homeId:intent.homeId,principalId:intent.principalId,root:intent.root,intentId:intent.intentId,status:'pending'});
  }
  const result=await executePublication(intent,transport);
  save(pointerPath,{homeId:intent.homeId,principalId:intent.principalId,root:intent.root,intentId:intent.intentId,status:'confirmed',result});return result;
 }finally{rmdirSync(lock);}
}
