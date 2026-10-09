import {env as publicEnv} from '$env/dynamic/public';
import {env} from '$env/dynamic/private';
import {error,json} from '@sveltejs/kit';
import {createHash} from 'node:crypto';
import {FulcraAPI} from '$lib/api-client.js';
import {createHomeFromAnswers} from '$lib/home/onboarding.js';
import {readFulcraFile,writeFulcraJSON} from '$lib/server/fulcra-files.js';
export async function POST({cookies,request}) {
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in first');
 let answers;try{const text=await request.text();if(text.length>30000)throw new Error();answers=JSON.parse(text);}catch{throw error(400,'Invalid setup answers');}
 const endpoint=publicEnv.PUBLIC_FULCRA_API_ENDPOINT;const api=new FulcraAPI(endpoint,token);const principal=await api.get('user/v1alpha1/info');
 /** @type {any} */ let home;try{home=createHomeFromAnswers(answers,principal.userid,new Date().toISOString());}catch(e){throw error(400,e instanceof Error?e.message:'Invalid setup answers');}
 // Fingerprint validated answers only; ignored extra properties are never stored.
 const normalized={id:home.id,name:home.name,timezone:home.timezone,systems:answers.systems,equipmentNames:answers.equipmentNames??'',rooms:answers.rooms??''};
 home.setupFingerprint=createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
 const root=`/shared/home-twin/${home.id}`;const previous=await readFulcraFile(endpoint,token,`${root}/home.json`);
 if(previous){const existing=JSON.parse(previous.text);if(existing.ownerUserId!==principal.userid||existing.setupFingerprint!==home.setupFingerprint)throw error(409,'This home already exists; its saved records were preserved');}
 else{
  await writeFulcraJSON(endpoint,token,`${root}/sources/onboarding.json`,{answers:normalized,authorUserId:principal.userid,recordedAt:home.createdAt});
  await writeFulcraJSON(endpoint,token,`${root}/home.json`,home);
 }
 const readback=await readFulcraFile(endpoint,token,`${root}/home.json`);
 if(!readback)return json({status:'pending-readback',homeId:home.id},{status:202});
 await writeFulcraJSON(endpoint,token,`${env.HOME_ROOT||'/home/twin'}/connection.json`,{ownerUserId:principal.userid,homeId:home.id});
 return json({status:'ready',homeId:home.id});
}
