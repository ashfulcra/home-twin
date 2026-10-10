import {applyReviewDecisions} from './review-decisions.mjs';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildAgentBrief} from '../src/lib/home/agent-brief.js';
import {syncHome} from './fulcra-ingest.mjs';
import {reconcileContributions} from '../src/lib/home/contributions.js';
const [action,input,folder,output,candidate]=process.argv.slice(2);
function validate(home){
 if(home.schemaVersion!==1||!Number.isSafeInteger(home.revision)||home.revision<1||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(home.id)||typeof home.name!=='string'||!home.name.trim())throw new Error('Invalid home version, ID, revision or name');
 for(const key of ['rooms','equipment','contacts','history','schedules','sources','notes'])if(!Array.isArray(home[key]??[]))throw new Error(`${key} must be an array`);
 for(const key of ['rooms','equipment','contacts','sources']){const ids=(home[key]??[]).map(row=>row.id);if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)throw new Error(`${key} IDs must be unique`);}
 return home;
}
try {
 if(!input||!['validate','reconcile','sync','brief','review'].includes(action))throw new Error('Usage: node scripts/home-agent.mjs validate HOME.json | reconcile HOME.json CONTRIBUTIONS_DIR NEW_REPORT.json | sync HOME_ID NEW_REPORT.json | brief HOME.json NEW_BRIEF.json | review HOME.json CONTRIBUTIONS_DIR DECISIONS.json NEW_CANDIDATE.json');
 if(action==='review'){
  if(!folder||!output||!candidate)throw Error('Contributions, decision file and new candidate output required');
  const home=validate(JSON.parse(readFileSync(resolve(input),'utf8')));
  const rows=readdirSync(resolve(folder)).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(readFileSync(join(resolve(folder),n),'utf8')));
  const decisions=JSON.parse(readFileSync(resolve(output),'utf8'));
  const report=applyReviewDecisions(home,rows,decisions);
  writeFileSync(resolve(candidate),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({revision:report.home.revision,decisions:report.decisionCount,remainingReview:report.review.length,authority:report.authority,remoteWrites:false}));
 }else if(action==='brief'){
  if(!folder)throw new Error('New brief output path required');
  const raw=JSON.parse(readFileSync(resolve(input),'utf8'));const home=validate(raw.home??raw);
  const brief=buildAgentBrief(home);writeFileSync(resolve(folder),JSON.stringify(brief,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({homeId:home.id,questions:brief.questions.length,authority:'unverified-offline',remoteWrites:false}));
 }else if(action==='sync'){
  if(!folder)throw new Error('New report output path required');
  const ingested=await syncHome(input);validate(ingested.home);
  const result={...reconcileContributions(ingested.home,ingested.rows),receipts:ingested.receipts,unavailableMembers:ingested.unavailableMembers,ingestedAt:ingested.ingestedAt,baselineVersion:ingested.baselineVersion};
  writeFileSync(resolve(folder),JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({accepted:result.accepted.length,review:result.review.length,unavailableMembers:result.unavailableMembers.length,baselineUnchanged:true}));
 }else{
 const home=validate(JSON.parse(readFileSync(resolve(input),'utf8')));
 if(action==='validate')console.log(JSON.stringify({valid:true,homeId:home.id,revision:home.revision}));
 else{
  if(!folder||!output)throw new Error('Contribution folder and new output path required');
  const rows=readdirSync(resolve(folder)).filter(name=>name.endsWith('.json')).map(name=>JSON.parse(readFileSync(join(resolve(folder),name),'utf8')));
  const result=reconcileContributions(home,rows);
  writeFileSync(resolve(output),JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({report:resolve(output),accepted:result.accepted.length,review:result.review.length,baselineUnchanged:true}));
 }
 }
}catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
