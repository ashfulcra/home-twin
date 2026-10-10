import {error,json} from '@sveltejs/kit';
import {resolveHome} from '$lib/server/home-access.js';
import {saveEvidence} from '$lib/server/evidence.js';
import {MAX_SOURCE_BYTES} from '$lib/home/attachments.js';
import {readBoundedBytes,readFulcraBytes,writeFulcraBytes,listFulcraJSON} from '$lib/server/fulcra-files.js';
export async function POST({cookies,request}){
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in to add a source');
 const access=await resolveHome(token);if(access.role==='viewer')throw error(403,'This home is read-only for you');
 let form;
 try{const bytes=await readBoundedBytes(request,MAX_SOURCE_BYTES+65536);form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')??''}}).formData();}catch{throw error(400,'Use one supported source up to 3 MiB');}
 const file=form.get('file');if(!(file instanceof File))throw error(400,'Choose a file');
 const input={id:form.get('id'),homeId:form.get('homeId'),title:form.get('title'),entityId:form.get('entityId')||undefined};
 const endpoint=access.endpoint;
 try{
  const result=await saveEvidence(access,input,new Uint8Array(await file.arrayBuffer()),file.type,file.name,{
   list:()=>listFulcraJSON(endpoint,token,`${access.root}/contributions`),
   read:(/** @type {string} */ path)=>readFulcraBytes(endpoint,token,path,MAX_SOURCE_BYTES),
   write:(/** @type {string} */ path,/** @type {Uint8Array} */ bytes,/** @type {string} */ type)=>writeFulcraBytes(endpoint,token,path,bytes,type)
  });
  return json(result,{status:result.status==='pending-readback'?202:201,headers:{'Cache-Control':'private, no-store'}});
 }catch(e){const message=e instanceof Error?e.message:'';
  if(/different content/.test(message))throw error(409,'This source ID already has different content');
  if(/Choose|stable ID|supported|File content/.test(message))throw error(400,message);
  throw error(502,'Source confirmation is unavailable. Keep this file and retry the same entry.');
 }
}
