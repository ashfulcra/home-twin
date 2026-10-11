import {error,json} from '@sveltejs/kit';
import {createJoinRequest,joinIntentID} from '$lib/home/joining.js';
import {buildJoinAgentStart} from '$lib/home/join-agent-start.js';
import {joinPrincipal,saveJoinIntent,joinDigest} from '$lib/server/join-access.js';
export async function POST({cookies,request}){
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in first');
 const {deployment,endpoint,userId}=await joinPrincipal(token);if(userId===deployment.ownerUserId)throw error(403,'You already own this home');
 let input,value;try{const text=await request.text();if(text.length>2500)throw new Error('Request is too long');input=JSON.parse(text);value=createJoinRequest(input,deployment,userId,input.recordedAt);if(await joinIntentID(value)!==value.id)throw new Error('Request ID changed: retry the original contents and declared time');}catch(e){throw error(400,e instanceof Error?e.message:'Invalid request');}
 const digest=joinDigest(JSON.stringify(value));const code=`${deployment.homeId}:${userId}:${value.id}:${digest}`;
 const path=`${deployment.sharedRoot}/join-requests/${value.id}-${digest}.json`;
 const result=await saveJoinIntent(endpoint,token,path,value);
 const start=buildJoinAgentStart(deployment,userId);
 const instructions=`My access request ${result.confirmed?'is saved':'is awaiting exact readback'} in MY Fulcra account at ${path}, with stable ID ${value.id}. The request code (fallback if needed) is ${code}. First verify exact saved content and my identity; do not share or claim it saved while readback is uncertain. Then ask my explicit approval to share ONLY this exact request file read-only (no history) with ownerUserId. Do not share its parent folder, other requests or my whole account. Saving does not send an email or push alert or grant home access. After the exact direct file share is confirmed, the owner can find this request in their Household inbox. They can also paste the fallback code into Household → Review a join request.`;
 return json({status:result.confirmed?'saved-private-request':'pending-readback',code,requestPath:path,request:result.value,prompt:start?start.prompt+'\n\n'+instructions:null},{status:result.confirmed?(result.reused?200:201):202,headers:{'Cache-Control':'private, no-store'}});
}
