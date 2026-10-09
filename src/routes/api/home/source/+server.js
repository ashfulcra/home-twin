import { env as publicEnv } from '$env/dynamic/public';
import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { readFulcraFile } from '$lib/server/fulcra-files.js';
export async function GET({cookies,url}) {
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Not authenticated');
 const manifest=await readFulcraFile(publicEnv.PUBLIC_FULCRA_API_ENDPOINT,token,`${env.HOME_ROOT||'/home/twin'}/home.json`);
 if(!manifest)throw error(404,'Home not found');
 const source=JSON.parse(manifest.text).sources?.find((/** @type {{id:string,path:string}} */ s)=>s.id===url.searchParams.get('id'));
 if(!source)throw error(404,'Source not found');
 const file=await readFulcraFile(publicEnv.PUBLIC_FULCRA_API_ENDPOINT,token,source.path);
 if(!file)throw error(404,'Source unavailable');
 return new Response(file.text,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'private, no-store'}});
}
