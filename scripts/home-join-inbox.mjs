import {resolve} from 'node:path';import {realpathSync} from 'node:fs';import {fileURLToPath} from 'node:url';
import {assertExternalState} from './maintainer-journal.mjs';import {validHomeRoot} from '../src/lib/home/home-root.js';
import {createOwnerJoinInboxClient} from './owner-join-inbox-client.mjs';import {runOwnerJoinInbox} from './owner-join-inbox.mjs';
const [action,homeId,directory,...flags]=process.argv.slice(2);
try{
 let root=`/shared/home-twin/${homeId}`;const seen=new Set();for(let i=0;i<flags.length;i++){const f=flags[i];if(seen.has(f))throw Error('Duplicate root option');seen.add(f);if(f==='--root')root=flags[++i];else if(f==='--legacy-root')root='/home/twin';else throw Error('Unknown option');}if(seen.has('--root')&&seen.has('--legacy-root'))throw Error('Choose one canonical root');
 if(action!=='inspect'||!directory||!validHomeRoot(homeId,root))throw Error('Usage: node scripts/home-join-inbox.mjs inspect HOME_ID EXISTING_PRIVATE_MAINTAINER_STATE [--root /PROJECT/twin | --legacy-root]. Read-only; no share, notification or approval is applied.');
 const state=resolve(directory);assertExternalState(state,realpathSync(fileURLToPath(new URL('../',import.meta.url))));const result=await runOwnerJoinInbox(state,{homeId,root},createOwnerJoinInboxClient(homeId,root));
 if(result.changed)console.log(JSON.stringify({homeId,reportPath:result.reportPath,reportId:result.reportId,attentionCount:result.inbox.attentionCount,unavailableCount:result.inbox.unavailableCount,unsupportedCount:result.inbox.unsupportedCount,more:result.inbox.more,reviewIncomplete:result.inbox.reviewIncomplete,remoteWrites:false}));
}catch(e){console.error(e instanceof Error?e.message:'Owner join inbox unavailable; preserve state and inspect current access.');process.exitCode=1;}
