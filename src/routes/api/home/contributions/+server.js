import {env as publicEnv} from '$env/dynamic/public';
import {resolveHome} from '$lib/server/home-access.js';
import {createHash} from 'node:crypto';
import {error,json} from '@sveltejs/kit';
import {FulcraAPI} from '$lib/api-client.js';
import {readFulcraFile,writeFulcraJSON,listFulcraJSON} from '$lib/server/fulcra-files.js';
import {validateContribution} from '$lib/home/contributions.js';
export async function POST({cookies,request}) {
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in to contribute');
 if(Number(request.headers.get('content-length')??0)>16000)throw error(413,'Contribution is too long');
 let input;
 try {const raw=await request.text();if(raw.length>16000)throw new Error('Contribution is too long');input=validateContribution(JSON.parse(raw));}catch(e){throw error(400,e instanceof Error?e.message:'Invalid contribution');}
 const endpoint=publicEnv.PUBLIC_FULCRA_API_ENDPOINT;
 try {
  const access=await resolveHome(token);const principal={userid:access.userId};const root=access.root;
  if(access.role==='viewer')throw error(403,'This home is read-only for you');
  if(!access.home||access.home.id!==input.homeId)throw error(404,'Home not found');
  const digest=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const path=`${root}/contributions/${input.id}-${digest}.json`;
  const previous=await listFulcraJSON(endpoint,token,`${root}/contributions`);
  const matches=previous.filter(saved=>saved?.id===input.id);
  if(matches.length){const saved=matches[0];const comparable={...saved};delete comparable.authorUserId;delete comparable.recordedAt;
   if(matches.length>1||saved.authorUserId!==principal.userid||JSON.stringify(comparable)!==JSON.stringify(input))throw error(409,'This contribution ID already has different content');
   return json({status:'saved',id:input.id,reused:true});
  }
  await writeFulcraJSON(endpoint,token,path,{...input,authorUserId:principal.userid,recordedAt:new Date().toISOString()});
  // Readback is separate: an uncertain response must retain this same ID.
  const saved=await readFulcraFile(endpoint,token,path);
  return json({status:saved?'saved':'pending-readback',id:input.id},{status:saved?201:202});
 }catch(e){if(e&&typeof e==='object'&&'status' in e)throw e;if(e instanceof Error&&/401/.test(e.message))throw error(401,'Session expired');throw error(502,'Could not confirm this contribution. Retry with the same ID.');}
}
