import {env} from '$env/dynamic/private';
import {env as publicEnv} from '$env/dynamic/public';
import {error} from '@sveltejs/kit';
import {createHash} from 'node:crypto';
import {FulcraAPI} from '$lib/api-client.js';
import {existingHomeDeployment} from '$lib/home/deployment.js';
import {parseJoinCode,validateSharedJoinRequest,joinIntentID} from '$lib/home/joining.js';
import {readFulcraBytes,writeFulcraJSON} from './fulcra-files.js';
/** @param {string} token */
export async function joinPrincipal(token){
 const deployment=existingHomeDeployment({...publicEnv,...env});if(!deployment)throw error(404,'Joining requests are available only in an existing-home app');
 const endpoint=publicEnv.PUBLIC_FULCRA_API_ENDPOINT;const principal=await new FulcraAPI(endpoint,token).get('user/v1alpha1/info');
 if(typeof principal?.userid!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(principal.userid))throw error(401,'Verify your Fulcra account before requesting home access');
 return {deployment,endpoint,userId:principal.userid};
}
/** @param {string|Uint8Array} value */
export const joinDigest=value=>createHash('sha256').update(value).digest('hex');
/** @param {string} endpoint @param {string} token @param {any} target @param {string} code */
export async function readSharedJoinRequest(endpoint,token,target,code){
 let source;try{source=parseJoinCode(code,target);}catch(e){throw error(400,e instanceof Error?e.message:'Invalid request code');}
 const bytes=await readFulcraBytes(endpoint,token,source.path,8192,source.userId);if(!bytes)throw error(404,'Request is unavailable. The applicant must explicitly share this exact request file with your account.');
 if(joinDigest(bytes)!==source.digest)throw error(409,'The shared request contents changed. Ask the applicant for the current request code and review it again.');
 let request;try{request=validateSharedJoinRequest(JSON.parse(new TextDecoder().decode(bytes)),source,target);}catch{throw error(422,'The shared request does not match this home, request ID and source account');}
 if(await joinIntentID(request)!==request.id)throw error(422,'Request ID does not match its declared contents');
 return {request,source,requestDigest:joinDigest(bytes)};
}
/** Guard content-bound IDs and report uncertain readback. Identical retries may
 * upload identical versions when prior writes are not yet visible.
 * Own-account versions are retained by Fulcra; concurrent or external edits are
 * rechecked by the separate publication executor, never inferred from this receipt.
 * @param {string} endpoint @param {string} token @param {string} path @param {any} value */
export async function saveJoinIntent(endpoint,token,path,value){
 if(await joinIntentID(value)!==value.id||!path.endsWith(`/${value.id}-${joinDigest(JSON.stringify(value))}.json`))throw error(400,'Intent identity and path must match its exact contents');
 const old=await readFulcraBytes(endpoint,token,path,8192);const intended=value;
 if(old){let saved;try{saved=JSON.parse(new TextDecoder().decode(old));}catch{throw error(409,'This ID already has an unreadable record. Saved versions were preserved.');}
  if(JSON.stringify(saved)!==JSON.stringify(intended))throw error(409,'This ID already has different content. Retry the original request or use a new ID.');
  return {confirmed:true,reused:true,value:saved};
 }
 await writeFulcraJSON(endpoint,token,path,intended);
 let confirmed=false;try{const readback=await readFulcraBytes(endpoint,token,path,8192);confirmed=!!readback&&JSON.stringify(JSON.parse(new TextDecoder().decode(readback)))===JSON.stringify(intended);}catch{/* The upload can precede readable metadata; retain this exact ID. */}
 return {confirmed,reused:false,value:intended};
}
