import {admissionForReviewStarted} from './access-guards.mjs';
import {join} from 'node:path';
import {runAdmission,assertAdmissionScope} from './admission-journal.mjs';
import {accessLock,readAccessState,saveAccessState} from './access-state.mjs';
/** Dashboard and CLI use the same persistent executor. Keep the preparation
 * lock through execution/recovery classification: another click cannot declare
 * a still-preparing operation unstarted. No occupied lock is expiry-stolen.
 * @param {string} directory @param {string} code @param {()=>Promise<any>} prepare @param {any} transport */
export async function applyWebAdmission(directory,code,prepare,transport){
 if(typeof code!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[a-f0-9]{64}$/.test(code))throw Error('Exact decision code required');
 return accessLock(join(directory,'web-packets'),async()=>{
  try{
   const path=join(directory,'web-packets',code+'.json'),old=readAccessState(path);
   const packet=old?.packet??await prepare();assertAdmissionScope(packet);
   if(packet.reviewId+'-'+packet.reviewDigest!==code)throw Error('Prepared decision code differs');
   if(!old)saveAccessState(path,{schema:'home-twin-web-packet/1',packet});
   return await runAdmission(directory,packet,typeof transport==='function'?transport(packet):transport,{ownerApproved:true,recipientUserId:packet.recipientUserId,publicationDigest:packet.publicationDigest});
  }catch(failure){
   const started=await accessLock(directory,async()=>admissionForReviewStarted(directory,code));
   if(started)throw failure;
   return {status:'review-required',noAccessMutationStarted:true,message:'Access setup did not begin. Read the current request and household contents, then review again.'};
  }
 });
}
