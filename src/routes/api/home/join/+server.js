import {buildApprovalCheckStart} from '$lib/home/join-agent-start.js';
import {error,json} from '@sveltejs/kit';import {resolveHome} from '$lib/server/home-access.js';import {joinPrincipal} from '$lib/server/join-access.js';import {callAccessService} from '$lib/server/access-service.js';
export async function POST({cookies,request}){
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in first');
 const {deployment,userId}=await joinPrincipal(token);const access=await resolveHome(token,{allowJoining:true});
 if(!access.joining||userId===deployment.ownerUserId)return json({status:'already-admitted'},{headers:{'Cache-Control':'private, no-store'}});
 let result;try{result=await callAccessService(token,deployment.homeId,'request',undefined,deployment.ownerUserId);}catch{throw error(503,'Your access request could not be confirmed. Retry to continue the same request; access has not been granted.');}
 const agentStart=buildApprovalCheckStart(deployment,userId,result,new URL(request.url).origin+'/');
 return json({...result,...(agentStart?{agentStart}:{})},{headers:{'Cache-Control':'private, no-store'}});
}
