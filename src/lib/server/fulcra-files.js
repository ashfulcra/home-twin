import { FulcraAPI } from '$lib/api-client.js';
/** @param {string} endpoint @param {string} token @param {string} path @param {string} [userId] */
export async function readFulcraFile(endpoint, token, path, userId) {
 const split=path.lastIndexOf('/');
 const folder=path.slice(0,split)||'/';const name=path.slice(split+1);
 const api=new FulcraAPI(endpoint,token);
 const suffix=userId?`&fulcra_userid=${encodeURIComponent(userId)}`:'';
 const listing=await api.get(`input/v1/file_upload?path=${encodeURIComponent(folder)}${suffix}`);
 const file=listing.files?.find((/** @type {{name:string,id:string}} */ f)=>f.name===name);
 if(!file)return null;
 const response=await fetch(`${endpoint}input/v1/file_upload/${file.id}/download${userId?`?fulcra_userid=${encodeURIComponent(userId)}`:''}`,{headers:{Authorization:`Bearer ${token}`}});
 if(!response.ok)throw new Error(`Fulcra file status ${response.status}`);
 return {text:await response.text(),id:file.id};
}

/** @param {string} endpoint @param {string} token @param {string} folder @param {string} [userId] */
export async function listFulcraJSON(endpoint,token,folder,userId) {
 const api=new FulcraAPI(endpoint,token);
 const listing=await api.get(`input/v1/file_upload?path=${encodeURIComponent(folder)}${userId?`&fulcra_userid=${encodeURIComponent(userId)}`:''}`);
 return Promise.all((listing.files??[]).filter((/** @type {any} */ file)=>file.name.endsWith('.json')).map(async(/** @type {any} */ file)=>{
  const response=await fetch(`${endpoint}input/v1/file_upload/${file.id}/download${userId?`?fulcra_userid=${encodeURIComponent(userId)}`:''}`,{headers:{Authorization:`Bearer ${token}`}});
  if(!response.ok)throw new Error(`Fulcra file status ${response.status}`);
  return JSON.parse(await response.text());
 }));
}
/** @param {string} endpoint @param {string} token @param {string} path @param {any} value */
export async function writeFulcraJSON(endpoint,token,path,value) {
 const split=path.lastIndexOf('/');const bytes=new TextEncoder().encode(JSON.stringify(value));
 const api=new FulcraAPI(endpoint,token);
 const upload=await api.post('input/v1/file_upload',{path:path.slice(0,split),name:path.slice(split+1),content_type:'application/json',content_length:bytes.byteLength});
 const response=await fetch(upload.url,{method:'POST',headers:{'Content-Type':'application/json','Content-Length':String(bytes.byteLength)},body:bytes});
 if(!response.ok)throw new Error(`Fulcra upload status ${response.status}`);
 return upload;
}
