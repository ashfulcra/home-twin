import {error,json} from '@sveltejs/kit';
import {resolveHome} from '$lib/server/home-access.js';
import {loadJoinInbox} from '$lib/server/join-inbox.js';
import {joinInboxReader} from '$lib/server/join-inbox-reader.js';
export async function GET({cookies}){
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in first');const access=await resolveHome(token);
 if(!access.deployment||access.role!=='maintainer'||access.userId!==access.ownerUserId)throw error(403,'Only this home’s current owner can read join requests');
 let result;try{result=await loadJoinInbox(access,joinInboxReader(access.endpoint,token,access.root));}catch{throw error(503,'Join requests could not be checked. Refresh to verify current shares and owner review records; this does not mean there are no requests.');}
 return json(result,{headers:{'Cache-Control':'private, no-store'}});
}
