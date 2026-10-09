import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {ingestHome} from '../src/lib/home/ingestion.js';
/** Tokens remain in memory; no whole-user-info response is printed or persisted. */
export async function syncHome(homeId){
 if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(homeId))throw new Error('Invalid home ID');
 const endpoint='https://api.fulcradynamics.com/';
 const token=execFileSync('fulcra',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const receipts=[];
 async function get(path){const r=await fetch(endpoint+path,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error(`Fulcra read status ${r.status}`);return r;}
 const principal=await(await get('user/v1alpha1/info')).json();const userId=principal.userid;
 async function readFolder(folder,sourceUserId){
  const query=`fulcra_userid=${encodeURIComponent(sourceUserId)}`;
  const listing=await(await get(`input/v1/file_upload?path=${encodeURIComponent(folder)}&${query}`)).json();
  const rows=[];
  for(const file of listing.files??[]){
   if(!file.name.endsWith('.json'))continue;
   const body=await(await get(`input/v1/file_upload/${encodeURIComponent(file.id)}/download?${query}`)).text();
   receipts.push({sourceUserId,fileId:file.id,path:`${folder}/${file.name}`,sha256:createHash('sha256').update(body).digest('hex')});
   let value;try{value=JSON.parse(body);}catch{value={homeId,kind:'invalid',text:'Unreadable JSON contribution',sourceFileId:file.id};}
   rows.push({name:file.name,value});
  }return rows;
 }
 const root=`/shared/home-twin/${homeId}`;
 // Read only the named baseline, not unrelated source files in its directory.
 const listing=await(await get(`input/v1/file_upload?path=${encodeURIComponent(root)}`)).json();
 const file=listing.files?.find(f=>f.name==='home.json');if(!file)throw new Error('Home record not found in authenticated account');
 const body=await(await get(`input/v1/file_upload/${encodeURIComponent(file.id)}/download`)).text();const home=JSON.parse(body);
 if(home.id!==homeId)throw new Error('Home ID does not match its folder');
 receipts.push({sourceUserId:userId,fileId:file.id,path:`${root}/home.json`,sha256:createHash('sha256').update(body).digest('hex')});
 const ingested=await ingestHome(home,userId,async account=>(await readFolder(`${root}/contributions`,account)).map(row=>row.value));
 return {home,...ingested,receipts,ingestedAt:new Date().toISOString(),baselineVersion:file.id};
}
