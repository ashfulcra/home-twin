import {loadJoinInbox} from '$lib/server/join-inbox.js';
import {joinInboxReader} from '$lib/server/join-inbox-reader.js';
import {joinApprovalAllowed} from '$lib/home/join-approval-policy.js';
import {error,json} from '@sveltejs/kit';
import {resolveHome} from '$lib/server/home-access.js';
import {readSharedJoinRequest,saveJoinIntent,joinDigest} from '$lib/server/join-access.js';
import {householdPublication,prepareHouseholdBase} from '$lib/home/household-publication.js';
import {buildJoinReview,joinIntentID} from '$lib/home/joining.js';
const headers={'Cache-Control':'private, no-store'};
/** @param {string} token */
async function owner(token){const access=await resolveHome(token);if(!access.deployment||access.role!=='maintainer'||access.userId!==access.ownerUserId||!access.home||!access.file)throw error(403,'Only this home’s current owner can review access requests');return access;}
export async function GET({cookies,url}){
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in first');
 const access=await owner(token);if(url.searchParams.get('preview')==='publication')return json({status:'publication-preview-no-recipient',publicationBase:await prepareHouseholdBase(access.home),homeRevision:access.home.revision},{headers});const source=await readSharedJoinRequest(access.endpoint,token,access.deployment,url.searchParams.get('code')??'');
 const publicationBase=await prepareHouseholdBase(access.home);
 return json({...source,publicationBase,publication:householdPublication(publicationBase,{userId:source.request.authorUserId,role:source.request.requestedRole}),homeRevision:access.home.revision,homeFileVersion:access.file.id,homeDigest:joinDigest(access.file.text),status:'request-read-not-approved'},{headers});
}
export async function POST({cookies,request}){
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in first');
 let input;try{const text=await request.text();if(text.length>2500)throw new Error('Review too long');input=JSON.parse(text);if(input.scopeConfirmed!==true)throw new Error('Confirm the specific recipient, role and publication scope');}catch(e){throw error(400,e instanceof Error?e.message:'Invalid review');}
 const access=await owner(token);const source=await readSharedJoinRequest(access.endpoint,token,access.deployment,input.code);
 if(input.decision==='approve'){const inbox=await loadJoinInbox(access,joinInboxReader(access.endpoint,token,access.root));const row=inbox.requests.find((/** @type {any} */r)=>r.code===input.code);if(!row||!joinApprovalAllowed(row))throw error(409,'This request needs its current decision history checked before approval.');}
 const homeDigest=joinDigest(access.file.text);
 if(source.requestDigest!==input.requestDigest||access.file.id!==input.homeFileVersion||access.home.revision!==input.homeRevision||homeDigest!==input.homeDigest)return json({message:'The request or home changed. Please try again.',code:'review-baseline-changed'},{status:409,headers});
 const publication=householdPublication(await prepareHouseholdBase(access.home),{userId:source.request.authorUserId,role:input.role??source.request.requestedRole});const publicationDigest=joinDigest(JSON.stringify(publication));if(input.publicationDigest!==publicationDigest)return json({message:'The home records changed. Please try again.',code:'review-baseline-changed'},{status:409,headers});
 let value;try{value=buildJoinReview(source.request,input,{...access,homeId:access.home.id,homeRevision:access.home.revision,homeFileVersion:access.file.id,homeDigest,requestDigest:source.requestDigest,publicationDigest},input.recordedAt);if(await joinIntentID(value)!==value.id)throw new Error('Review ID changed: retry the original contents and declared time');}catch(e){throw error(400,e instanceof Error?e.message:'Invalid review');}
 const result=await saveJoinIntent(access.endpoint,token,`${access.root}/join-decisions/${value.id}-${joinDigest(JSON.stringify(value))}.json`,value);
 return json({status:result.confirmed?'saved-review-intent':'pending-readback',review:result.value,reviewCode:`${value.id}-${joinDigest(JSON.stringify(value))}`,accessStatus:'not-granted-by-this-action'},{status:result.confirmed?(result.reused?200:201):202,headers});
}
