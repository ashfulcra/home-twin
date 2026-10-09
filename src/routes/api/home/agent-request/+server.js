import {error,json} from '@sveltejs/kit';
import {resolveHome} from '$lib/server/home-access.js';
import {writeFulcraJSON} from '$lib/server/fulcra-files.js';
export async function POST({cookies}) {
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in first');
 const access=await resolveHome(token);if(!access.home)throw error(404,'Set up your home first');
 const request={schemaVersion:1,homeId:access.home.id,ownerUserId:access.ownerUserId,requestedBy:access.userId,requestedAt:new Date().toISOString(),status:'awaiting-agent-connection',scope:'Maintain home facts, equipment, contacts, care history and correctable model. Preserve original evidence. Routine contributions may be projected; contradictions and major model changes require review.'};
 await writeFulcraJSON(access.endpoint,token,`${access.root}/agent-request.json`,request);
 return json({status:request.status,homeId:request.homeId});
}
