import {error,json} from '@sveltejs/kit';import {resolveHome} from '$lib/server/home-access.js';import {callAccessService} from '$lib/server/access-service.js';
export async function POST({cookies,request}){
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in first');const access=await resolveHome(token);
 if(!access.deployment||access.userId!==access.ownerUserId||access.role!=='maintainer')throw error(403,'Only this home’s owner can approve access');
 let input;try{const text=await request.text();if(text.length>1000)throw Error();input=JSON.parse(text);if(typeof input.reviewCode!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[a-f0-9]{64}$/.test(input.reviewCode))throw Error();}catch{throw error(400,'Use the exact saved decision code');}
 let result;try{result=await callAccessService(token,access.deployment.homeId,'apply',input.reviewCode,access.deployment.ownerUserId);}catch{throw error(503,'Access setup could not be confirmed. Retry this same decision to check its saved progress; do not create a new approval.');}
 return json(result,{headers:{'Cache-Control':'private, no-store'}});
}

import {readFulcraBytes} from '$lib/server/fulcra-files.js';import {createHash} from 'node:crypto';import {joinIntentID} from '$lib/home/joining.js';
export async function GET({cookies,url}){
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in first');const access=await resolveHome(token);
 if(!access.deployment||access.userId!==access.ownerUserId||access.role!=='maintainer')throw error(403,'Only this home’s owner can resume access setup');
 const code=url.searchParams.get('reviewCode')??'';if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[a-f0-9]{64}$/.test(code))throw error(400,'Use the exact saved decision code');
 const bytes=await readFulcraBytes(access.endpoint,token,access.root+'/join-decisions/'+code+'.json',8192);if(!bytes)throw error(404,'Saved decision unavailable');
 let value;try{value=JSON.parse(new TextDecoder().decode(bytes));if(createHash('sha256').update(bytes).digest('hex')!==code.slice(-64)||value.id!==code.slice(0,36)||await joinIntentID(value)!==value.id||value.schema!=='home-twin-join-review/2'||value.homeId!==access.deployment.homeId||value.authorUserId!==access.userId||value.ownerUserId!==access.userId||!['approve','reject'].includes(value.decision)||!/^[a-f0-9-]{36}$/.test(value.recipientUserId)||value.decision==='approve'&&!['viewer','contributor'].includes(value.role))throw Error();}catch{throw error(409,'Saved decision identity differs; preserve it and inspect before continuing');}
 return json({status:'saved-decision',decision:value.decision,recipientUserId:value.recipientUserId,role:value.role},{headers:{'Cache-Control':'private, no-store'}});
}
