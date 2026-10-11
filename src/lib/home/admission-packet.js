import {buildJoinReview,joinIntentID,joinContentDigest} from './joining.js';
import {householdPublication,prepareHouseholdBase} from './household-publication.js';
import {validHomeRoot} from './home-root.js';
/** A verified plan for the designated maintainer, not execution permission or grant proof.
 * @param {any} review @param {any} request @param {any} context @param {any} publication */
export async function buildAdmissionPacket(review,request,context,publication){
 if(review?.schema!=='home-twin-join-review/2'||review.decision!=='approve'||context.userId!==context.home?.ownerUserId||context.home.id!==context.homeId||context.home.revision!==context.homeRevision||!validHomeRoot(context.homeId,context.root))throw Error('Exact current owner approval and bounded home baseline required');
 if(context.root+'/home.json'===review.scope.publicationPath)throw Error('A distinct private canonical root is required before household admission');
 const expected=buildJoinReview(request,review,context,review.recordedAt);if(JSON.stringify(expected)!==JSON.stringify(review)||await joinIntentID(review)!==review.id)throw Error('Review identity or current baseline changed');
 if(await joinContentDigest(JSON.stringify(request))!==review.requestDigest)throw Error('Request contents changed');
 const prepared=householdPublication(await prepareHouseholdBase(context.home),{userId:review.recipientUserId,role:review.role});
 if(JSON.stringify(prepared)!==JSON.stringify(publication)||await joinContentDigest(JSON.stringify(publication))!==review.publicationDigest)throw Error('Exact approved publication contents changed');
 const reviewDigest=await joinContentDigest(JSON.stringify(review));
 return {schema:'home-twin-admission-packet/1',status:'prepared-not-applied',homeId:review.homeId,ownerUserId:review.ownerUserId,recipientUserId:review.recipientUserId,role:review.role,
 reviewId:review.id,reviewDigest,reviewPath:`${context.root}/join-decisions/${review.id}-${reviewDigest}.json`,requestPath:review.requestPath,requestDigest:review.requestDigest,
 baseline:{root:context.root,revision:review.homeRevision,fileVersion:review.homeFileVersion,digest:review.homeDigest},
 publicationPath:review.scope.publicationPath,publicationDigest:review.publicationDigest,publication,
 plannedMembership:{userId:review.recipientUserId,role:review.role},
 shareBody:{datashare_name:`home-twin:${review.homeId}:${review.id}`,fulcra_user_name:review.ownerUserId,time_start:null,time_end:null,fulcra_data_types:[`file:${review.scope.publicationPath}`],share_all_data:false,permissions:[{allowed_fulcra_userid:review.recipientUserId}],group_permissions:[]},
 excluded:['Original documents','File history','Private vaults','Other homes','Member return contributions','Agent mesh'],
 executionPrerequisites:['Verify the actual owner-approved recipient and these exact contents/scope. This packet is evidence, not standalone tool authorization.','Use the designated maintainer and its existing private state/lock. Preserve the previous canonical and publication versions.','Re-read exact request/review/current canonical baseline before any mutation. Hold drift or conflicting decisions.','Resolve pending/uncertain writes or grants before fresh publication. Inspect grant readback instead of repeating a possibly accepted create.','Verify exact canonical membership, curated publication and outgoing per-recipient share readback. Only a genuine member account can verify delivery and current access.','Contributors separately approve their own return contributions/evidence and optional mesh; never grant those from this owner decision.']};
}
