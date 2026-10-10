import {createHash} from 'node:crypto';
import {sourceLocation} from '../src/lib/server/source-location.js';
/** Bounded original-source hashing; never retain raw bytes or treat failures as unchanged.
 * @param {any} home @param {string} root @param {(path:string)=>Promise<Response>} get
 * @param {{maxBytes?:number}} options */
export async function auditHomeSources(home,root,get,options={}){
 if(!home||!(/^[a-z0-9][a-z0-9-]{0,79}$/).test(home.id)||!home.ownerUserId||!['/home/twin',`/shared/home-twin/${home.id}`].includes(root))throw Error('Intended home owner and root required');
 const refs=home.sources??[];if(!Array.isArray(refs)||refs.length>100)throw Error('Source audit supports up to 100 referenced originals');
 const maxBytes=options.maxBytes??10*1024*1024;if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>10*1024*1024)throw Error('Invalid source byte limit');
 /** @type {any[]} */ const checks=[];/** @type {any[]} */ const receipts=[];const ids=new Set();
 for(const source of refs){
  if(typeof source.id!=='string'||!source.id||source.id.length>120||ids.has(source.id))throw Error('Unique source IDs required');ids.add(source.id);
  const expected=source.attachment?.sha256??source.sha256;const expectedSHA256=/^[a-f0-9]{64}$/.test(expected)?expected:null;
  /** @type {any} */ const check={id:source.id,expectedSHA256,currentSHA256:null,status:'unavailable'};
  let location;
  try{location=sourceLocation({home,root,ownerUserId:home.ownerUserId,userId:home.ownerUserId},source);
   const path=location.path;const prefix=root==='/home/twin'?'/home/':root+'/sources/';
   if(!path.startsWith(prefix)||path.includes('\\')||path.includes('\0')||path.split('/').some((/** @type {string} */ p)=>p==='.'||p==='..')||path.includes('//'))throw Error('Out of scope');
  }catch{checks.push({...check,status:'out-of-scope',reason:'source-location-not-authorized'});continue;}
  check.path=location.path;check.sourceUserId=location.userId;
  try{
   const split=location.path.lastIndexOf('/');const query='fulcra_userid='+encodeURIComponent(location.userId);
   const listing=await(await get(`input/v1/file_upload?path=${encodeURIComponent(location.path.slice(0,split))}&${query}`)).json();
   if(!Array.isArray(listing.files))throw Error('Source listing unavailable');const file=listing.files.find((/** @type {any} */ f)=>f.name===location.path.slice(split+1));
   if(!file){check.reason='source-not-found';checks.push(check);continue;}
   const response=await get(`input/v1/file_upload/${encodeURIComponent(file.id)}/download?${query}`);
   if(!response.body||Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel();check.reason='source-too-large';checks.push(check);continue;}
   const reader=response.body.getReader();const hash=createHash('sha256');let size=0;let oversized=false;
   try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>maxBytes){oversized=true;await reader.cancel();break;}hash.update(chunk.value);}}finally{reader.releaseLock();}
   if(oversized){check.reason='source-too-large';checks.push(check);continue;}
   check.currentSHA256=hash.digest('hex');check.status=expectedSHA256===null?'unverified':expectedSHA256===check.currentSHA256?'unchanged':'changed';
   receipts.push({sourceUserId:location.userId,fileId:file.id,path:location.path,sha256:check.currentSHA256});checks.push(check);
  }catch{checks.push({...check,status:'unavailable',currentSHA256:null,reason:'source-read-unavailable'});}
 }
 return {checks:checks.sort((a,b)=>a.id.localeCompare(b.id)),receipts};
}
