import { env as publicEnv } from '$env/dynamic/public';
import {resolveHome} from '$lib/server/home-access.js';
import { error } from '@sveltejs/kit';
import { readFulcraFile } from '$lib/server/fulcra-files.js';
export async function GET({cookies,url}) {
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Not authenticated');
 const access=await resolveHome(token);const manifest=access.file;
 if(!manifest)throw error(404,'Home not found');
 const source=JSON.parse(manifest.text).sources?.find((/** @type {{id:string,path:string}} */ s)=>s.id===url.searchParams.get('id'));
 if(!source)throw error(404,'Source not found');
 if(access.ownerUserId!==access.userId&&!source.path.startsWith(`${access.root}/sources/`))throw error(403,'This source is not in the shared home folder');
 const file=await readFulcraFile(publicEnv.PUBLIC_FULCRA_API_ENDPOINT,token,source.path,access.ownerUserId);
 if(!file)throw error(404,'Source unavailable');
 return new Response(file.text,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'private, no-store'}});
}
