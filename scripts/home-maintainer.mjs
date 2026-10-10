import {mkdirSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {syncHome} from './fulcra-ingest.mjs';
import {buildMaintainerCycle} from '../src/lib/home/maintainer-cycle.js';
import {persistCycle,assertExternalState} from './maintainer-journal.mjs';
const [action,homeId,directory,...flags]=process.argv.slice(2);
try{
 if(action!=='cycle'||!homeId||!directory||flags.some(f=>f!=='--legacy-root'))throw Error('Usage: node scripts/home-maintainer.mjs cycle HOME_ID PRIVATE_STATE_DIR [--legacy-root]');
 const state=resolve(directory);mkdirSync(state,{recursive:true,mode:0o700});
 const repo=realpathSync(fileURLToPath(new URL('../',import.meta.url)));assertExternalState(state,repo);
 const intake=await syncHome(homeId,flags.includes('--legacy-root')?{root:'/home/twin'}:{});
 const cycle=buildMaintainerCycle(intake);const result=persistCycle(state,cycle);
 if(result.changed)console.log(JSON.stringify({...result,homeId,accepted:cycle.accepted.length,review:cycle.review.items.length,work:cycle.work.length,unavailableMembers:intake.unavailableMembers.length,remoteWrites:false}));
}catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
