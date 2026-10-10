import {createHash} from 'node:crypto';
import {canonicalJSON} from '../src/lib/home/canonical-json.js';
import {buildMaintainerCycle} from '../src/lib/home/maintainer-cycle.js';
/** @param {any} value */
const hash=value=>createHash('sha256').update(canonicalJSON(value)).digest('hex');
/** Only currently reconciled routine changes are publication candidates. @param {any} input */
export function buildPublicationIntent(input){
 const cycle=buildMaintainerCycle(input);
 if(!cycle.accepted.length||canonicalJSON(cycle.material.home)===canonicalJSON(cycle.candidate))return null;
 const target={...cycle.candidate,revision:cycle.material.home.revision+1};
 if(!Number.isSafeInteger(target.revision))throw Error('Home revision limit reached');
 const payload={schema:'home-twin-publication/1',homeId:cycle.homeId,principalId:cycle.principalId,root:cycle.root,baselineVersion:cycle.baselineVersion,baseDigest:hash(cycle.material.home),base:cycle.material.home,cycleId:cycle.cycleId,target,targetDigest:hash(target),accepted:cycle.accepted,review:cycle.review};
 return {...payload,intentId:hash(payload)};
}
/** External transport always uses the same current caller token; no distributed CAS.
 * @param {any} intent @param {{read:()=>Promise<any>,readSnapshot:(path:string)=>Promise<any>,write:(path:string,value:any,beforeCommit?:()=>Promise<void>)=>Promise<any>}} transport */
export async function executePublication(intent,transport){
 const {intentId,...payload}=intent;
 if(intent.schema!=='home-twin-publication/1'||hash(payload)!==intentId||hash(intent.target)!==intent.targetDigest||hash(intent.base)!==intent.baseDigest)throw Error('Publication intent integrity mismatch');
 const inspect=async()=>{
  const current=await transport.read();
  if(current.principalId!==intent.principalId||current.home.ownerUserId!==current.principalId||current.home.id!==intent.homeId||current.root!==intent.root)throw Error('Current publication identity or scope changed');
  if(hash(current.home)===intent.targetDigest)return 'confirmed';
  if(current.baselineVersion!==intent.baselineVersion||hash(current.home)!==intent.baseDigest||buildPublicationIntent(current)?.intentId!==intentId)throw Error('Baseline or contributions changed; preserve intent and reconcile fresh intake');
  return 'baseline';
 };
 if(await inspect()==='confirmed')return {confirmed:true,reused:true,intentId,revision:intent.target.revision};
 const backupPath=`${intent.root}/history/${intent.baseDigest}.json`;const previous=await transport.readSnapshot(backupPath);
 if(previous&&hash(previous)!==intent.baseDigest)throw Error('Prior snapshot collision; preserve files for inspection');
 if(!previous){await transport.write(backupPath,intent.base);if(hash(await transport.readSnapshot(backupPath))!==intent.baseDigest)throw Error('Prior snapshot readback failed');}
 if(await inspect()==='confirmed')return {confirmed:true,reused:true,intentId,revision:intent.target.revision};
 let writeFailed=false;try{await transport.write(`${intent.root}/home.json`,intent.target,async()=>{if(await inspect()!=='baseline')throw Error('Snapshot already published; confirm by readback');});}catch{writeFailed=true;}
 const current=await transport.read();
 if(current.principalId!==intent.principalId||current.root!==intent.root||current.home.ownerUserId!==intent.principalId||hash(current.home)!==intent.targetDigest)throw Error(writeFailed?'Publication result uncertain; preserve intent and retry readback':'Publication readback differs; preserve intent and inspect current snapshot');
 return {confirmed:true,reused:false,intentId,revision:intent.target.revision};
}
