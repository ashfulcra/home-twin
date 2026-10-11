import { FulcraAPI } from '../api-client.js';
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
  const body=await response.text();try{return JSON.parse(body);}catch{return null;}
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

/** Stream limits apply even without Content-Length. @param {Response|Request} response @param {number} max */
export async function readBoundedBytes(response,max){
 if(Number(response.headers.get('content-length')??0)>max)throw new Error('Source exceeds the upload limit');
 if(!response.body)return new Uint8Array();const reader=response.body.getReader();const chunks=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>max){await reader.cancel();throw new Error('Source exceeds the upload limit');}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
/** @param {string} endpoint @param {string} token @param {string} path @param {number} max @param {string} [userId] */
export async function readFulcraBytes(endpoint,token,path,max,userId){
 const split=path.lastIndexOf('/');const api=new FulcraAPI(endpoint,token);
 const listing=await api.get(`input/v1/file_upload?path=${encodeURIComponent(path.slice(0,split))}${userId?`&fulcra_userid=${encodeURIComponent(userId)}`:''}`);
 const file=listing.files?.find((/** @type {any} */ f)=>f.name===path.slice(split+1));if(!file)return null;
 const r=await fetch(`${endpoint}input/v1/file_upload/${file.id}/download${userId?`?fulcra_userid=${encodeURIComponent(userId)}`:''}`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error(`Fulcra source status ${r.status}`);
 return readBoundedBytes(r,max);
}
/** @param {string} endpoint @param {string} token @param {string} path @param {Uint8Array} bytes @param {string} contentType */
export async function writeFulcraBytes(endpoint,token,path,bytes,contentType){
 const split=path.lastIndexOf('/');const api=new FulcraAPI(endpoint,token);
 const upload=await api.post('input/v1/file_upload',{path:path.slice(0,split),name:path.slice(split+1),content_type:contentType,content_length:bytes.byteLength});
 const r=await fetch(upload.url,{method:'POST',headers:{'Content-Type':contentType,'Content-Length':String(bytes.byteLength)},body:new Uint8Array(bytes)});if(!r.ok)throw new Error(`Fulcra source upload status ${r.status}`);
}
