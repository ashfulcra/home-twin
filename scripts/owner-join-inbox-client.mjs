import {execFileSync} from 'node:child_process';
import {validHomeRoot} from '../src/lib/home/home-root.js';
import {readBoundedBytes} from '../src/lib/server/fulcra-files.js';
import {joinInboxReader} from '../src/lib/server/join-inbox-reader.js';
/** Official current-caller read-only client. Tokens stay in memory.
 * @param {string} homeId @param {string} root @param {{token?:string,fetch?:typeof fetch}} [options] */
export function createOwnerJoinInboxClient(homeId,root,options={}){
 if(!validHomeRoot(homeId,root))throw Error('Valid intended home ID/root required');
 let token=options.token;if(token===undefined){try{token=execFileSync('fulcra',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}catch{throw Error('Current Fulcra owner authentication unavailable');}}if(!token)throw Error('Current owner authentication required');
 const endpoint='https://api.fulcradynamics.com/',send=options.fetch??fetch;
 async function get(/** @type {string} */path,/** @type {number} */limit=1024*1024){const r=await send(endpoint+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Owner join discovery read status ${r.status}`);return new TextDecoder().decode(await readBoundedBytes(r,limit));}
 return {get inbox(){return joinInboxReader(endpoint,token,root,send);},readAccess:async()=>{
  const principal=JSON.parse(await get('user/v1alpha1/info'));const userId=principal?.userid;if(typeof userId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(userId))throw Error('Authenticated owner identity unavailable');
  const listing=JSON.parse(await get('input/v1/file_upload?path='+encodeURIComponent(root)));if(!Array.isArray(listing.files)||listing.files.length>5000)throw Error('Home baseline metadata unavailable');const files=listing.files.filter((/** @type {any} */f)=>f?.name==='home.json');if(files.length!==1||typeof files[0].id!=='string'||!files[0].id||files[0].id.length>200)throw Error('Home baseline unavailable or ambiguous');const file={id:files[0].id,text:await get('input/v1/file_upload/'+encodeURIComponent(files[0].id)+'/download',2*1024*1024)};const home=JSON.parse(file.text);
  if(home?.id!==homeId||home?.ownerUserId!==userId||!Number.isInteger(home?.revision)||home.revision<1||(home?.members!==undefined&&!Array.isArray(home.members)))throw Error('Current canonical home owner/baseline required');return {endpoint,userId,ownerUserId:userId,root,home,file,role:'maintainer',deployment:{homeId,ownerUserId:userId}};
 }};
}
