import {mkdirSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {syncHome,createMaintainerClient} from './fulcra-ingest.mjs';
import {buildMaintainerCycle} from '../src/lib/home/maintainer-cycle.js';
import {persistCycle,assertExternalState} from './maintainer-journal.mjs';
import {runPublication} from './publication-journal.mjs';
const [action,homeId,directory,...flags]=process.argv.slice(2);
try{
 if(!['cycle','publish'].includes(action)||!homeId||!directory||flags.some(f=>!['--legacy-root','--check-sources'].includes(f))||action==='publish'&&flags.includes('--check-sources'))throw Error('Usage: node scripts/home-maintainer.mjs cycle|publish HOME_ID PRIVATE_STATE_DIR [--legacy-root] [--check-sources for cycle]');
 const state=resolve(directory);mkdirSync(state,{recursive:true,mode:0o700});
 const repo=realpathSync(fileURLToPath(new URL('../',import.meta.url)));assertExternalState(state,repo);
 const options={...(flags.includes('--legacy-root')?{root:'/home/twin'}:{}),...(flags.includes('--check-sources')?{checkSources:true}:{})};
 if(action==='publish'){const result=await runPublication(state,createMaintainerClient(homeId,options));if(result)console.log(JSON.stringify(result));}else{
 const intake=await syncHome(homeId,options);
 const cycle=buildMaintainerCycle(intake);const result=persistCycle(state,cycle);
 if(result.changed)console.log(JSON.stringify({...result,homeId,accepted:cycle.accepted.length,review:cycle.review.items.length,work:cycle.work.length,unavailableMembers:intake.unavailableMembers.length,remoteWrites:false}));
 }
}catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
