import { env as publicEnv } from '$env/dynamic/public';
import {resolveHome} from '$lib/server/home-access.js';
import {attributeSharedRows} from '$lib/home/access.js';
import { error, json } from '@sveltejs/kit';
import { readFulcraFile, listFulcraJSON } from '$lib/server/fulcra-files.js';
import {reconcileContributions} from '$lib/home/contributions.js';
import { projectHome } from '$lib/home/projection.js';
export async function GET({cookies}) {
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in to view your home');
 try {
  const access=await resolveHome(token);const {file,home}=access;
  if(!file)return json({status:'empty'},{headers:{'Cache-Control':'private, no-store'}});
  if(home.schemaVersion!==1)throw error(422,'Unsupported home data version');
  const own=await listFulcraJSON(access.endpoint,token,`${access.root}/contributions`);
  let rows=attributeSharedRows(own,access.userId);
  const unavailable=[];
  // Only the designated maintainer reads inbound contributions. No discovery
  // of other accounts or arbitrary folders from contribution content.
  if(access.role==='maintainer')for(const member of home.members??[]){
   if(member.role!=='contributor'||member.userId===access.userId)continue;
   try{rows.push(...attributeSharedRows(await listFulcraJSON(access.endpoint,token,`/shared/home-twin/${home.id}/contributions`,member.userId),member.userId));}
   catch{unavailable.push(member.userId);}
  }
  const result=reconcileContributions(home,rows);
  return json({status:'ready',home:projectHome(result.home,new Date().toISOString()),review:result.review,accepted:result.accepted,role:access.role,unavailableMembers:unavailable,fileVersion:file.id},{headers:{'Cache-Control':'private, no-store'}});
 }catch(err){
  if(err instanceof Error && /status 403|failed: 403/.test(err.message))throw error(403,'Shared home access is unavailable or revoked');
  if(err instanceof Error && /status 401|failed: 401/.test(err.message))throw error(401,'Session expired');
  if(err && typeof err==='object' && 'status' in err)throw err;
  throw error(502,'Home data is unavailable. Your saved records are unchanged.');
 }
}
