import {readFileSync,writeFileSync} from 'node:fs';
import {captureDevice} from './device-capture.mjs';
const [file,output]=process.argv.slice(2);
try{
 if(!file||!output)throw Error('Usage: node scripts/capture-device.mjs PRIVATE_CONFIG.json NEW_OBSERVATION.json');
 const config=JSON.parse(readFileSync(file,'utf8'));
 const key=config.tokenEnv??'HOME_TWIN_HA_TOKEN';if(!/^HOME_TWIN_[A-Z0-9_]+$/.test(key))throw Error('Use a HOME_TWIN_ credential environment variable');
 const observation=await captureDevice(config,config.kind==='home-assistant'?process.env[key]:undefined);
 writeFileSync(output,JSON.stringify(observation,null,2),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({captured:true,id:observation.id,availability:observation.availability,observedAt:observation.observedAt,sourceTimeBasis:observation.sourceTimeBasis,remoteWrites:false}));
}catch(e){console.error(e instanceof Error?e.message:'Capture failed');process.exitCode=1;}
