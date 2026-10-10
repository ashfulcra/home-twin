import {error,json} from '@sveltejs/kit';
import {resolveHome} from '$lib/server/home-access.js';
import {readHomeContributions} from '$lib/server/home-contributions.js';
import {reconcileContributions} from '$lib/home/contributions.js';
import {buildReviewPacket} from '$lib/home/review-packet.js';
export async function GET({cookies}){
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in to read home review context');
 const access=await resolveHome(token);if(!access.home||!access.file)throw error(404,'Set up your home first');
 const {rows,unavailable}=await readHomeContributions(access,token);const result=reconcileContributions(access.home,rows);
 const packet=buildReviewPacket(access.home,result.review,{role:access.role,fileVersion:access.file.id});
 return json({...packet,unavailableMembers:unavailable},{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'attachment; filename="home-review-packet.json"'}});
}
