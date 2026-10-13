import {resolveHome} from '$lib/server/home-access.js';
import {readHomeContributions} from '$lib/server/home-contributions.js';
import {reconcileContributions} from '$lib/home/contributions.js';
import {sourceLocation} from '$lib/server/source-location.js';
import {error} from '@sveltejs/kit';
import {createHash} from 'node:crypto';
import {readFulcraBytes} from '$lib/server/fulcra-files.js';
import {MAX_SOURCE_BYTES} from '$lib/home/attachments.js';
export async function GET({cookies,url}){
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Not authenticated');
 const access=await resolveHome(token);if(!access.file)throw error(404,'Home not found');
 const {rows}=await readHomeContributions(access,token);
 const source=reconcileContributions(access.home,rows).home.sources?.find((/** @type {any} */ s)=>s.id===url.searchParams.get('id'));
 if(!source)throw error(404,'Source not found');
 let location;try{location=sourceLocation(access,source);}catch{throw error(403,'This source is outside current home access');}
 if(source.attachment){
  const bytes=await readFulcraBytes(access.endpoint,token,location.path,MAX_SOURCE_BYTES,location.userId);
  if(!bytes)throw error(404,'Source unavailable; the contributor must share this home’s source folder');
  if(bytes.byteLength!==source.attachment.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==source.attachment.sha256)throw error(409,'Original source checksum no longer matches');
  return new Response(bytes,{headers:{'Content-Type':source.attachment.mimeType,'Content-Disposition':`attachment; filename="source-${source.contributionId}.${source.attachment.extension}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
 }
 if(source.sha256!=null&&(typeof source.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(source.sha256)))throw error(409,'Recorded source checksum needs review');
 // Preserve the existing legacy size policy; uploaded attachments remain bounded above.
 const bytes=await readFulcraBytes(access.endpoint,token,location.path,Infinity,location.userId);if(!bytes)throw error(404,'Source unavailable');
 if(source.sha256!=null&&createHash('sha256').update(bytes).digest('hex')!==source.sha256.toLowerCase())throw error(409,'Original source changed; its recorded checksum no longer matches');
 return new Response(bytes,{headers:{'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
}
