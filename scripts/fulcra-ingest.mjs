import {validHomeRoot} from '../src/lib/home/home-root.js';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {auditHomeSources} from './source-audit.mjs';
import {ingestHome} from '../src/lib/home/ingestion.js';
/** Tokens remain in memory; no whole-user-info response is printed or persisted.
 * @param {string} homeId @param {{root?:string,checkSources?:boolean,sourceMaxBytes?:number}} options */
export async function syncHome(homeId,options={}){return createMaintainerClient(homeId,options).read();}
/** @param {string} homeId @param {{root?:string,checkSources?:boolean,sourceMaxBytes?:number}} options */
export function createMaintainerClient(homeId,options={}){
 if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(homeId))throw new Error('Invalid home ID');
 const root=options.root??`/shared/home-twin/${homeId}`;
 if(!validHomeRoot(homeId,root))throw Error('Invalid home root');
 const token=execFileSync('fulcra',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 return createCallerMaintainerClient(homeId,options,token);
}
/** Server writes require the actual current caller. This adapter has no CLI authentication fallback.
 * @param {string} homeId @param {{root?:string,checkSources?:boolean,sourceMaxBytes?:number}} options @param {string} token @param {typeof fetch} [send] */
export function createCallerMaintainerClient(homeId,options,token,send=fetch){
 if(typeof token!=='string'||token.length<8||token.length>16384)throw Error('Current caller token required');
 const root=options.root??`/shared/home-twin/${homeId}`;if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(homeId)||!validHomeRoot(homeId,root))throw Error('Intended home scope required');
 const endpoint='https://api.fulcradynamics.com/';
 async function get(/** @type {string} */ path){const r=await send(endpoint+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`Fulcra read status ${r.status}`);return r;}
 return {read:()=>readMaintainerHome(homeId,root,get,options),
  readSnapshot:async (/** @type {string} */ path)=>{if(!path.startsWith(root+'/history/'))throw Error('Only intended home history may be inspected');const split=path.lastIndexOf('/');const listing=await(await get(`input/v1/file_upload?path=${encodeURIComponent(path.slice(0,split))}`)).json();const file=listing.files?.find((/** @type {any} */ f)=>f.name===path.slice(split+1));return file?await(await get(`input/v1/file_upload/${encodeURIComponent(file.id)}/download`)).json():null;},
  write:async (/** @type {string} */ path,/** @type {any} */ value,/** @type {(()=>Promise<void>)|undefined} */ beforeCommit=undefined)=>{
   if(path!==root+'/home.json'&&!new RegExp('^'+root+'/history/[a-f0-9]{64}\\.json$').test(path))throw Error('Only intended home snapshot/history may be written');
   const split=path.lastIndexOf('/');const bytes=new TextEncoder().encode(JSON.stringify(value));
   const r=await send(endpoint+'input/v1/file_upload',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({path:path.slice(0,split),name:path.slice(split+1),content_type:'application/json',content_length:bytes.byteLength}),signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Error(`Fulcra upload preparation status ${r.status}`);const upload=await r.json();
   const url=new URL(upload.url);if(url.protocol!=='https:')throw Error('Invalid secure upload URL');
   if(beforeCommit)await beforeCommit();
   const sent=await send(url,{method:'POST',headers:{'Content-Type':'application/json','Content-Length':String(bytes.byteLength)},body:bytes,signal:AbortSignal.timeout(15000)});if(!sent.ok)throw Error(`Fulcra upload status ${sent.status}`);
  }};
}
/** Read only the intended home through current caller permissions.
 * @param {string} homeId @param {string} root @param {(path:string)=>Promise<Response>} get @param {{checkSources?:boolean,sourceMaxBytes?:number}} options */
export async function readMaintainerHome(homeId,root,get,options={}){
 if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(homeId)||!validHomeRoot(homeId,root))throw Error('Invalid home ID or home root');
 const receipts=[];
 const principal=await(await get('user/v1alpha1/info')).json();const userId=principal.userid;
 async function readFolder(/** @type {string} */ folder,/** @type {string} */ sourceUserId){
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
 // Read only the named baseline, not unrelated source files in its directory.
 const listing=await(await get(`input/v1/file_upload?path=${encodeURIComponent(root)}`)).json();
 const file=listing.files?.find((/** @type {any} */ f)=>f.name==='home.json');if(!file)throw new Error('Home record not found in authenticated account');
 const body=await(await get(`input/v1/file_upload/${encodeURIComponent(file.id)}/download`)).text();const home=JSON.parse(body);
 if(home.id!==homeId)throw new Error('Home ID does not match its folder');
 if(home.ownerUserId!==userId)throw Error('Only the authenticated home maintainer can ingest household contributions');
 receipts.push({sourceUserId:userId,fileId:file.id,path:`${root}/home.json`,sha256:createHash('sha256').update(body).digest('hex')});
 const ingested=await ingestHome(home,userId,async account=>(await readFolder(`${account===userId?root:`/shared/home-twin/${homeId}`}/contributions`,account)).map(row=>row.value));
 const audit=options.checkSources?await auditHomeSources(home,root,get,options.sourceMaxBytes===undefined?{}:{maxBytes:options.sourceMaxBytes}):null;if(audit)receipts.push(...audit.receipts);
 const latest=await(await get(`input/v1/file_upload?path=${encodeURIComponent(root)}`)).json();const current=latest.files?.find((/** @type {any} */ f)=>f.name==='home.json');
 if(!current||current.id!==file.id||(await(await get(`input/v1/file_upload/${encodeURIComponent(current.id)}/download`)).text())!==body)throw Error('Baseline changed during intake; retry with fresh state');
 return {home,principalId:userId,root,...ingested,...(audit?{sourceChecks:audit.checks}:{}),receipts,ingestedAt:new Date().toISOString(),baselineVersion:file.id};
}
