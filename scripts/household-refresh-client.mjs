import {execFileSync} from 'node:child_process';
import {assertRefreshScope} from '../src/lib/home/household-refresh.js';

/** Current-owner transport with no canonical/grant write method.
 * @param {any} packet @param {{token?:string,fetch?:typeof fetch}} [options] */
export function createHouseholdRefreshClient(packet,options={}){
 assertRefreshScope(packet);const root=packet.baseline.root;
 let token=options.token;if(token===undefined){try{token=execFileSync('fulcra',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}catch{throw Error('Fulcra owner authentication unavailable');}}
 const send=options.fetch??fetch,endpoint='https://api.fulcradynamics.com/';
 /** @type {string|undefined} */
 let principal;
 const history=new RegExp('^'+root.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/history/[a-f0-9]{64}\\.json$');
 const writable=(/** @type {string} */path)=>path===packet.publicationPath||history.test(path);
 async function api(/** @type {string} */path,/** @type {any} */body=undefined){const response=await send(endpoint+path,{headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error(`Fulcra refresh status ${response.status}`);return response;}
 async function owner(){if(!principal){const result=await(await api('user/v1alpha1/info')).json();if(result.userid!==packet.ownerUserId)throw Error('Connect the configured owner account; never borrow another token');principal=result.userid;}return principal;}
 async function file(/** @type {string} */path){
  await owner();const split=path.lastIndexOf('/'),listing=await(await api('input/v1/file_upload?path='+encodeURIComponent(path.slice(0,split)))).json();
  if(!Array.isArray(listing.files))throw Error('File metadata unavailable');const files=listing.files.filter((/** @type {any} */f)=>f.name===path.slice(split+1));if(files.length>1)throw Error('Ambiguous current file metadata');if(!files.length)return null;const current=files[0];if(typeof current.id!=='string')throw Error('Current file identity missing');
  const response=await api('input/v1/file_upload/'+encodeURIComponent(current.id)+'/download');const limit=2*1024*1024;if(Number(response.headers.get('content-length')??0)>limit)throw Error('Refresh file exceeds bounded limit');if(!response.body)throw Error('File bytes unavailable');
  const reader=response.body.getReader(),chunks=[];let bytes=0;try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>limit){await reader.cancel();throw Error('Refresh file exceeds bounded limit');}chunks.push(part.value);}}finally{reader.releaseLock();}
  return {text:Buffer.concat(chunks).toString('utf8'),id:current.id};
 }
 return {
  readInputs:async()=>{const principalId=await owner(),current=await file(root+'/home.json');if(!current)throw Error('Private canonical home unavailable');let home;try{home=JSON.parse(current.text);}catch{throw Error('Private canonical JSON unreadable; preserve original');}return {principalId,home,rawHome:current.text,fileVersion:current.id};},
  readFile:async(/** @type {string} */path)=>{if(path!==root+'/home.json'&&!writable(path))throw Error('Read outside exact refresh scope denied');return (await file(path))?.text??null;},
  writeFile:async(/** @type {string} */path,/** @type {string} */text,/** @type {()=>Promise<void>} */before)=>{if(!writable(path)||typeof text!=='string'||Buffer.byteLength(text)>2*1024*1024||typeof before!=='function')throw Error('Write outside exact refresh scope denied');await owner();const split=path.lastIndexOf('/'),bytes=Buffer.from(text),upload=await(await api('input/v1/file_upload',{path:path.slice(0,split),name:path.slice(split+1),content_type:'application/json',content_length:bytes.length})).json();const url=new URL(upload.url);if(url.protocol!=='https:')throw Error('Secure refresh upload URL required');await before();const result=await send(url,{method:'POST',headers:{'Content-Type':'application/json','Content-Length':String(bytes.length)},body:bytes,signal:AbortSignal.timeout(15000)});if(!result.ok)throw Error(`Refresh upload status ${result.status}`);},
  listShares:async()=>{await owner();const shares=await(await api('user/v1/datashare')).json();if(!Array.isArray(shares))throw Error('Outgoing grants unavailable');return shares;}
 };
}
