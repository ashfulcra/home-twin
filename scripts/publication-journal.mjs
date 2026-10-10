import {mkdirSync,lstatSync,readFileSync,writeFileSync,renameSync,rmdirSync} from 'node:fs';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {buildPublicationIntent,executePublication} from './maintainer-publish.mjs';
/** @param {string} path */
function privatePath(path){const st=lstatSync(path);if(st.isSymbolicLink()||(st.mode&0o077))throw Error('Private publication state required');return st;}
/** Same inspected-lock recovery policy as cycle journal. @param {string} directory @param {any} transport */
export async function runPublication(directory,transport){
 mkdirSync(directory,{recursive:true,mode:0o700});if(!privatePath(directory).isDirectory())throw Error('State directory required');
 const lock=join(directory,'.cycle.lock');try{mkdirSync(lock,{mode:0o700});}catch{throw Error('Cycle lock occupied; inspect prior process before abandoned-lock recovery');}
 const save=(/** @type {string} */ path,/** @type {any} */ value)=>{const tmp=join(directory,'.publication-'+randomUUID()+'.json');writeFileSync(tmp,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});renameSync(tmp,path);};
 const read=(/** @type {string} */ path)=>{try{if(!privatePath(path).isFile())throw Error('State file required');return JSON.parse(readFileSync(path,'utf8'));}catch(e){if(e&&typeof e==='object'&&'code' in e&&e.code==='ENOENT')return null;throw e;}};
 try{
  const pointerPath=join(directory,'publication.json');const pointer=read(pointerPath);const current=await transport.read();
  if(pointer&&(pointer.homeId!==current.home.id||pointer.principalId!==current.principalId||pointer.root!==current.root||!['pending','confirmed'].includes(pointer.status)))throw Error('Publication state scope mismatch');
  const intents=join(directory,'publications');mkdirSync(intents,{recursive:true,mode:0o700});if(!privatePath(intents).isDirectory())throw Error('Intent directory required');
  let intent;
  if(pointer?.status==='pending'){
   if(!/^[a-f0-9]{64}$/.test(pointer.intentId))throw Error('Invalid pending intent');intent=read(join(intents,pointer.intentId+'.json'));if(!intent||intent.intentId!==pointer.intentId)throw Error('Pending intent missing or mismatched; preserve files');
  }else{
   intent=buildPublicationIntent(current);if(!intent)return null;
   const path=join(intents,intent.intentId+'.json');const existing=read(path);if(existing&&JSON.stringify(existing)!==JSON.stringify(intent))throw Error('Immutable intent collision');if(!existing)save(path,intent);
   save(pointerPath,{homeId:intent.homeId,principalId:intent.principalId,root:intent.root,intentId:intent.intentId,status:'pending'});
  }
  const result=await executePublication(intent,transport);
  save(pointerPath,{homeId:intent.homeId,principalId:intent.principalId,root:intent.root,intentId:intent.intentId,status:'confirmed',result});return result;
 }finally{rmdirSync(lock);}
}
