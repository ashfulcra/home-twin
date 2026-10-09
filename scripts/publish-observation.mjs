import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {execFileSync} from 'node:child_process';
import {validateFeed,normalizeObservation} from '../src/lib/home/feeds.js';
const [dataType,file]=process.argv.slice(2);
let staging;
try{
 validateFeed({id:'publish',name:'Device observation',dataType,freshnessSeconds:300});
 const input=JSON.parse(readFileSync(file,'utf8'));const observation=normalizeObservation(input);
 if(!observation||typeof observation.homeId!=='string'||!(/^[a-z0-9][a-z0-9-]{0,79}$/).test(observation.homeId))throw new Error('Invalid home observation');
 // Source event ID and device observation time must be retained on retry. Receipt is bridge-local, not a claim about Fulcra arrival.
 observation.receivedAt??=new Date().toISOString();delete observation.fulcraRecordedAt;
 staging=mkdtempSync(join(tmpdir(),'home-twin-observation-'));const path=join(staging,'record.json');writeFileSync(path,JSON.stringify({note:JSON.stringify(observation)}),{mode:0o600});
 execFileSync('fulcra',['record',dataType,'--file',path],{stdio:['ignore','pipe','pipe']});
 console.log(JSON.stringify({submitted:true,sourceEventId:observation.id,note:'Confirm through Fulcra readback; uncertain retries keep this event ID and payload.'}));
}catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
finally{if(staging)rmSync(staging,{recursive:true});}
