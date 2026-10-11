import {error} from '@sveltejs/kit';
import {resolveHome} from '$lib/server/home-access.js';
import {buildHouseholdRefresh} from '$lib/home/household-refresh.js';
export async function GET({cookies}){
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in first');
 const access=await resolveHome(token);if(!access.deployment||access.role!=='maintainer'||access.userId!==access.ownerUserId||!access.home||!access.file)throw error(403,'Only this home’s current owner can prepare a household refresh');
 let packet;try{packet=await buildHouseholdRefresh(access.home,{userId:access.userId,root:access.root,fileVersion:access.file.id,rawHome:access.file.text});}catch(e){throw error(409,e instanceof Error?e.message:'Review current membership and canonical scope first');}
 return new Response(JSON.stringify(packet,null,2),{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','Content-Disposition':'attachment; filename="household-refresh.json"'}});
}
