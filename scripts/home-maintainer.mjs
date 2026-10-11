import {mkdirSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {syncHome,createMaintainerClient} from './fulcra-ingest.mjs';
import {buildMaintainerCycle} from '../src/lib/home/maintainer-cycle.js';
import {persistCycle,assertExternalState} from './maintainer-journal.mjs';
import {runPublication} from './publication-journal.mjs';
import {validHomeRoot} from '../src/lib/home/home-root.js';
const [action,homeId,directory,...flags]=process.argv.slice(2);
try{
 const options={};const seen=new Set();
 for(let i=0;i<flags.length;i++){
  const flag=flags[i];if(seen.has(flag))throw Error('Duplicate option');seen.add(flag);
  if(flag==='--root'){const root=flags[++i];if(!validHomeRoot(homeId,root))throw Error('Invalid home root');options.root=root;}
  else if(flag==='--legacy-root')options.root='/home/twin';
  else if(flag==='--check-sources')options.checkSources=true;
  else throw Error('Unknown option');
 }
 if(seen.has('--root')&&seen.has('--legacy-root'))throw Error('Choose one home root');
 if(!['cycle','publish'].includes(action)||!homeId||!directory||action==='publish'&&options.checkSources)throw Error('Usage: node scripts/home-maintainer.mjs cycle|publish HOME_ID PRIVATE_STATE_DIR [--root /PROJECT/twin | --legacy-root] [--check-sources for cycle]');
 const state=resolve(directory);mkdirSync(state,{recursive:true,mode:0o700});
 const repo=realpathSync(fileURLToPath(new URL('../',import.meta.url)));assertExternalState(state,repo);
 if(action==='publish'){const result=await runPublication(state,createMaintainerClient(homeId,options));if(result)console.log(JSON.stringify(result));}else{
 const intake=await syncHome(homeId,options);
 const cycle=buildMaintainerCycle(intake);const result=persistCycle(state,cycle);
 if(result.changed)console.log(JSON.stringify({...result,homeId,accepted:cycle.accepted.length,review:cycle.review.items.length,work:cycle.work.length,unavailableMembers:intake.unavailableMembers.length,remoteWrites:false}));
 }
}catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
