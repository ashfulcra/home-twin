import { FulcraAPI } from '$lib/api-client.js';
/** @param {string} endpoint @param {string} token @param {string} path */
export async function readFulcraFile(endpoint, token, path) {
 const split=path.lastIndexOf('/');
 const folder=path.slice(0,split)||'/';const name=path.slice(split+1);
 const api=new FulcraAPI(endpoint,token);
 const listing=await api.get(`input/v1/file?path=${encodeURIComponent(folder)}`);
 const file=listing.files?.find((/** @type {{name:string,id:string}} */ f)=>f.name===name);
 if(!file)return null;
 const response=await fetch(`${endpoint}input/v1/file/${file.id}/download`,{headers:{Authorization:`Bearer ${token}`}});
 if(!response.ok)throw new Error(`Fulcra file status ${response.status}`);
 return {text:await response.text(),id:file.id};
}
