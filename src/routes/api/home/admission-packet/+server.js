import {error,json} from '@sveltejs/kit';
import {resolveHome} from '$lib/server/home-access.js';
import {readFulcraBytes} from '$lib/server/fulcra-files.js';
import {joinDigest,readSharedJoinRequest} from '$lib/server/join-access.js';
import {householdPublication,prepareHouseholdBase} from '$lib/home/household-publication.js';
import {buildAdmissionPacket} from '$lib/home/admission-packet.js';
export async function GET({cookies,url}){
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in first');
 const access=await resolveHome(token);if(!access.deployment||access.role!=='maintainer'||access.userId!==access.ownerUserId||!access.home||!access.file)throw error(403,'Only this home’s current owner can prepare an admission packet');
 const code=url.searchParams.get('decision')??'';if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[a-f0-9]{64}$/.test(code))throw error(400,'Use the exact saved decision code');
 const raw=await readFulcraBytes(access.endpoint,token,`${access.root}/join-decisions/${code}.json`,8192);if(!raw)throw error(404,'Saved decision is unavailable; confirm its exact readback first');
 if(joinDigest(raw)!==code.slice(-64))throw error(409,'Decision contents changed; preserve versions and review again');
 let packet;try{const review=JSON.parse(new TextDecoder().decode(raw));if(review.id!==code.slice(0,36))throw Error('Decision ID mismatch');const source=await readSharedJoinRequest(access.endpoint,token,access.deployment,`${review.homeId}:${review.recipientUserId}:${review.requestId}:${review.requestDigest}`);const publication=householdPublication(await prepareHouseholdBase(access.home),{userId:review.recipientUserId,role:review.role});packet=await buildAdmissionPacket(review,source.request,{...access,homeId:access.home.id,homeRevision:access.home.revision,homeFileVersion:access.file.id,homeDigest:joinDigest(access.file.text),requestDigest:source.requestDigest,publicationDigest:joinDigest(JSON.stringify(publication))},publication);}catch(e){throw error(409,e instanceof Error?e.message:'Admission inputs changed or need owner review');}
 return json(packet,{headers:{'Cache-Control':'private, no-store','Content-Disposition':'attachment; filename="home-twin-admission-packet.json"'}});
}
