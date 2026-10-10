import {mkdirSync,lstatSync,readFileSync,writeFileSync,renameSync,rmdirSync,realpathSync} from 'node:fs';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {canonicalJSON} from '../src/lib/home/canonical-json.js';
/** @param {any} value */
const hash=value=>createHash('sha256').update(canonicalJSON(value)).digest('hex');
/** Local single-writer checkpoint; abandoned locks require inspection, never expiry stealing.
 * @param {string} directory @param {any} cycle */
export function persistCycle(directory,cycle){
 const dir=resolve(directory);mkdirSync(dir,{recursive:true,mode:0o700});
 const privateDir=(/** @type {string} */ path)=>{const s=lstatSync(path);if(s.isSymbolicLink()||!s.isDirectory()||(s.mode&0o077))throw Error('Use a private mode0700 state directory without symlinks');};privateDir(dir);
 if(!/^[a-f0-9]{64}$/.test(cycle.cycleId)||cycle.schema!=='home-twin-maintainer-cycle/1')throw Error('Valid cycle required');
 const lock=join(dir,'.cycle.lock');try{mkdirSync(lock,{mode:0o700});}catch{throw Error('Cycle lock occupied; inspect the active/abandoned run before removing its lock');}
 try{
  const checkpointPath=join(dir,'checkpoint.json');let previous=null;
  try{const st=lstatSync(checkpointPath);if(st.isSymbolicLink()||!st.isFile()||(st.mode&0o077))throw Error('Private checkpoint required');previous=JSON.parse(readFileSync(checkpointPath,'utf8'));}catch(e){if(!(e&&typeof e==='object'&&'code' in e&&e.code==='ENOENT'))throw e;}
  const scope={principalId:cycle.principalId,homeId:cycle.homeId,root:cycle.root};
  if(previous&&(previous.schema!=='home-twin-checkpoint/1'||Object.entries(scope).some(([k,v])=>previous[k]!==v)))throw Error('State directory scope differs; use a separate private directory');
  const reports=join(dir,'reports');mkdirSync(reports,{recursive:true,mode:0o700});privateDir(reports);
  const reportPath=join(reports,cycle.cycleId+'.json');let recovered=false;
  try{
   const st=lstatSync(reportPath);if(st.isSymbolicLink()||!st.isFile()||(st.mode&0o077))throw Error('Private report required');
   const saved=JSON.parse(readFileSync(reportPath,'utf8'));const {integrity,...payload}=saved;
   if(saved.cycleId!==cycle.cycleId||hash(payload)!==integrity||canonicalJSON(saved.material)!==canonicalJSON(cycle.material))throw Error('Report integrity mismatch; preserve and inspect original files');
   recovered=previous?.lastCycleId!==cycle.cycleId;
  }catch(e){if(!(e&&typeof e==='object'&&'code' in e&&e.code==='ENOENT'))throw e;const staged=join(dir,'.report-'+randomUUID()+'.json');writeFileSync(staged,JSON.stringify({...cycle,integrity:hash(cycle)},null,2),{flag:'wx',mode:0o600});renameSync(staged,reportPath);}
  if(previous?.lastCycleId===cycle.cycleId)return {changed:false,recovered:false,reportPath:realpathSync(reportPath),cycleId:cycle.cycleId};
  const checkpoint={schema:'home-twin-checkpoint/1',...scope,lastCycleId:cycle.cycleId,workIds:cycle.work.map((/** @type {any} */ t)=>t.id)};
  const temporary=join(dir,'.checkpoint-'+randomUUID()+'.json');writeFileSync(temporary,JSON.stringify(checkpoint,null,2),{flag:'wx',mode:0o600});renameSync(temporary,checkpointPath);
  return {changed:true,recovered,reportPath:realpathSync(reportPath),cycleId:cycle.cycleId};
 }finally{rmdirSync(lock);}
}

/** @param {string} state @param {string} repo */
export function assertExternalState(state,repo){const rel=relative(realpathSync(repo),realpathSync(state));if(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep))throw Error('Keep private state outside the public repository');}
