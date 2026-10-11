import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {assertExternalState} from './maintainer-journal.mjs';
import {runHouseholdRefresh} from './household-refresh-journal.mjs';
import {createHouseholdRefreshClient} from './household-refresh-client.mjs';
const [action,packetFile,directory,...flags]=process.argv.slice(2);
try{
 if(action!=='apply'||!packetFile||!directory)throw Error('Usage: node scripts/home-household-refresh.mjs apply PRIVATE_PACKET EXISTING_STATE --owner-approved --publication-sha EXACT_SHA --members-sha EXACT_SHA');
 const consent={},seen=new Set();for(let i=0;i<flags.length;i++){const flag=flags[i];if(seen.has(flag))throw Error('Duplicate option');seen.add(flag);if(flag==='--owner-approved')consent.ownerApproved=true;else if(flag==='--publication-sha')consent.publicationDigest=flags[++i];else if(flag==='--members-sha')consent.membersDigest=flags[++i];else throw Error('Unknown option');}
 if(seen.size!==3||!consent.ownerApproved||!/^[a-f0-9]{64}$/.test(consent.publicationDigest??'')||!/^[a-f0-9]{64}$/.test(consent.membersDigest??''))throw Error('Exact owner-approved content and current members confirmation required');
 const repo=realpathSync(fileURLToPath(new URL('../',import.meta.url))),state=resolve(directory),source=resolve(packetFile);assertExternalState(state,repo);assertExternalState(source,repo);
 const stat=lstatSync(source);if(stat.isSymbolicLink()||!stat.isFile()||(stat.mode&0o077)||stat.size>3*1024*1024)throw Error('Private mode0600 bounded packet required');let packet;try{packet=JSON.parse(readFileSync(source,'utf8'));}catch{throw Error('Refresh packet JSON unreadable');}
 const result=await runHouseholdRefresh(state,packet,createHouseholdRefreshClient(packet),consent);console.log(JSON.stringify(result));
}catch(e){console.error(e instanceof Error?e.message:'Household refresh failed; preserve private intent');process.exitCode=1;}
