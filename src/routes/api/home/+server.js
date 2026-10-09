import { env as publicEnv } from '$env/dynamic/public';
import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import { readFulcraFile, listFulcraJSON } from '$lib/server/fulcra-files.js';
import {reconcileContributions} from '$lib/home/contributions.js';
import { projectHome } from '$lib/home/projection.js';
export async function GET({cookies}) {
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in to view your home');
 try {
  const file=await readFulcraFile(publicEnv.PUBLIC_FULCRA_API_ENDPOINT,token,`${env.HOME_ROOT||'/home/twin'}/home.json`);
  if(!file)return json({status:'empty'});
  const home=JSON.parse(file.text);
  if(home.schemaVersion!==1)throw error(422,'Unsupported home data version');
  const rows=await listFulcraJSON(publicEnv.PUBLIC_FULCRA_API_ENDPOINT,token,`${env.HOME_ROOT||'/home/twin'}/contributions`);
  const result=reconcileContributions(home,rows);
  return json({status:'ready',home:projectHome(result.home,new Date().toISOString()),review:result.review,accepted:result.accepted,fileVersion:file.id});
 }catch(err){
  if(err instanceof Error && /status 401|failed: 401/.test(err.message))throw error(401,'Session expired');
  if(err && typeof err==='object' && 'status' in err)throw err;
  throw error(502,'Home data is unavailable. Your saved records are unchanged.');
 }
}
