import {lstatSync,readFileSync,writeFileSync,mkdirSync,renameSync,rmdirSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {canonicalJSON} from '../src/lib/home/canonical-json.js';
import {loadJoinInbox} from '../src/lib/server/join-inbox.js';
const hash=(/** @type {any} */v)=>createHash('sha256').update(canonicalJSON(v)).digest('hex');
/** Read-only discovery with private immutable reports in the existing maintainer state.
 * @param {string} directory @param {any} scope @param {any} client */
export async function runOwnerJoinInbox(directory,scope,client){
 const dir=resolve(directory);
 function privatePath(/** @type {string} */p,/** @type {boolean} */folder=false){const st=lstatSync(p);if(st.isSymbolicLink()||(st.mode&0o077)||(folder?!st.isDirectory():!st.isFile())||!folder&&st.size>512*1024)throw Error('Private bounded non-symlink join inbox state required');return st;}
 function read(/** @type {string} */p){try{privatePath(p);return JSON.parse(readFileSync(p,'utf8'));}catch(e){if(e&&typeof e==='object'&&'code' in e&&e.code==='ENOENT')return null;throw e;}}
 privatePath(dir,true);const lock=join(dir,'.cycle.lock');try{mkdirSync(lock,{mode:0o700});}catch{throw Error('Maintainer lock occupied; inspect the existing run; never clear a live lock');}
 try{
  const checkpoint=read(join(dir,'checkpoint.json'));if(!checkpoint||checkpoint.schema!=='home-twin-checkpoint/1'||checkpoint.homeId!==scope.homeId||checkpoint.root!==scope.root||scope.principalId&&checkpoint.principalId!==scope.principalId)throw Error('Existing same-home maintainer checkpoint required; preserve its scope');
  const access=await client.readAccess();if(access.userId!==checkpoint.principalId||access.root!==scope.root||access.home?.id!==scope.homeId)throw Error('Current owner and existing maintainer state scope differ');
  const prior=read(join(dir,'join-inbox.json'));if(prior&&(prior.schema!=='home-twin-join-inbox-checkpoint/1'||canonicalJSON(prior.scope)!==canonicalJSON({homeId:scope.homeId,root:scope.root,principalId:access.userId})||!/^[a-f0-9]{64}$/.test(prior.reportId)))throw Error('Join inbox checkpoint integrity/scope differs');
  const inbox=await loadJoinInbox(access,client.inbox);const current=await client.readAccess();if(current.userId!==access.userId||current.root!==access.root||current.file?.id!==access.file?.id||current.file?.text!==access.file?.text||current.home?.ownerUserId!==access.userId)throw Error('Canonical home changed during join discovery; retry with fresh state');
  const material={scope:{homeId:scope.homeId,root:scope.root,principalId:access.userId},inbox};const reportId=hash(material);const reports=join(dir,'join-inbox-reports');try{mkdirSync(reports,{mode:0o700});}catch(e){if(!(e&&typeof e==='object'&&'code' in e&&e.code==='EEXIST'))throw e;}privatePath(reports,true);
  function validate(/** @type {any} */saved,/** @type {string} */id){if(!saved)throw Error('Retained join inbox report missing');const {integrity,...payload}=saved;if(saved.schema!=='home-twin-owner-join-inbox/1'||saved.reportId!==id||hash(saved.material)!==id||hash(payload)!==integrity||canonicalJSON(saved.material.scope)!==canonicalJSON(material.scope))throw Error('Join inbox report integrity differs; preserve original files');}
  if(prior)validate(read(join(reports,prior.reportId+'.json')),prior.reportId);
  const reportPath=join(reports,reportId+'.json');const existing=read(reportPath);if(existing)validate(existing,reportId);else{const report={schema:'home-twin-owner-join-inbox/1',reportId,scope:material.scope,material,inbox,observedAt:new Date().toISOString(),remoteWrites:false};const staged=join(dir,'.join-report-'+randomUUID()+'.json');writeFileSync(staged,JSON.stringify({...report,integrity:hash(report)},null,2),{flag:'wx',mode:0o600});renameSync(staged,reportPath);}
  const changed=prior?.reportId!==reportId;if(changed){const staged=join(dir,'.join-checkpoint-'+randomUUID()+'.json');writeFileSync(staged,JSON.stringify({schema:'home-twin-join-inbox-checkpoint/1',scope:material.scope,reportId},null,2),{flag:'wx',mode:0o600});renameSync(staged,join(dir,'join-inbox.json'));}
  return {changed,reportPath:realpathSync(reportPath),reportId,inbox,remoteWrites:false};
 }finally{rmdirSync(lock);}
}
