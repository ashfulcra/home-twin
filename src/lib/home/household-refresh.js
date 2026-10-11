import {prepareHouseholdBase} from './household-publication.js';
import {validHomeRoot} from './home-root.js';
import {canonicalJSON} from './canonical-json.js';
import {joinContentDigest} from './joining.js';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sha=/^[a-f0-9]{64}$/;

/** @param {any} packet */
export function assertRefreshScope(packet){
 if(packet?.schema!=='home-twin-household-refresh/1'||packet.status!=='prepared-not-applied'||!uuid.test(packet.ownerUserId)||!validHomeRoot(packet.homeId,packet.baseline?.root)||!sha.test(packet.baseline.digest)||!sha.test(packet.publicationDigest)||!sha.test(packet.membersDigest)||(!Number.isSafeInteger(packet.baseline.revision)||packet.baseline.revision<1)||typeof packet.baseline.fileVersion!=='string'||!packet.baseline.fileVersion)throw Error('Bounded owner refresh packet required');
 if(packet.publicationPath!==`/shared/home-twin/${packet.homeId}/home.json`||packet.baseline.root+'/home.json'===packet.publicationPath)throw Error('Distinct private canonical and household publication required');
 const members=packet.publication?.members;
 if(!Array.isArray(members)||!members.length||members.length>2000||members.some(m=>!uuid.test(m.userId)||m.userId===packet.ownerUserId||!['viewer','contributor'].includes(m.role))||new Set(members.map(m=>m.userId)).size!==members.length)throw Error('Current approved members required');
 if(packet.publication.id!==packet.homeId||packet.publication.ownerUserId!==packet.ownerUserId||packet.publication.revision!==packet.baseline.revision)throw Error('Refresh publication identity differs');
}

/** Owner-only read-only preparation, not permission or a write.
 * @param {any} home @param {any} context */
export async function buildHouseholdRefresh(home,context){
 if(context.userId!==home?.ownerUserId||!validHomeRoot(home.id,context.root)||typeof context.rawHome!=='string'||canonicalJSON(JSON.parse(context.rawHome))!==canonicalJSON(home))throw Error('Coherent current owner baseline required');
 const publication=await prepareHouseholdBase(home);
 const packet={schema:'home-twin-household-refresh/1',status:'prepared-not-applied',homeId:home.id,ownerUserId:home.ownerUserId,
  baseline:{root:context.root,revision:home.revision,fileVersion:context.fileVersion,digest:await joinContentDigest(context.rawHome)},
  publicationPath:`/shared/home-twin/${home.id}/home.json`,publicationDigest:await joinContentDigest(JSON.stringify(publication)),membersDigest:await joinContentDigest(canonicalJSON(publication.members)),publication};
 assertRefreshScope(packet);return packet;
}

/** Current outgoing proof only, never proof of member delivery. Broad/unknown access holds.
 * @param {any[]} shares @param {any} packet */
export function validateRefreshShares(shares,packet){
 assertRefreshScope(packet);if(!Array.isArray(shares))throw Error('Outgoing access grants unavailable');
 const members=new Set(packet.publication.members.map((/** @type {any} */m)=>m.userId)),seen=new Set(),covered=new Set(),receipts=[];
 for(const s of shares){
  if(!s||s.share_all_data!==false||!Array.isArray(s.fulcra_data_types))throw Error('Unknown or all-account outgoing access needs inspection');
  const related=s.fulcra_data_types.some((/** @type {any} */type)=>{
   if(typeof type!=='string')throw Error('Unknown outgoing data scope');
   if(!type.startsWith('file'))return false;
   const colon=type.indexOf(':');if(colon<0)throw Error('Unknown file access scope');const path=type.slice(colon+1).replace(/\/$/,'');
   return path===packet.publicationPath||packet.publicationPath.startsWith(path+'/');
  });
  if(!related)continue;
  if(typeof s.datashare_id!=='string'||!s.datashare_id||seen.has(s.datashare_id)||s.fulcra_user_name!==packet.ownerUserId||s.time_start!==null||s.time_end!==null||canonicalJSON(s.fulcra_data_types)!==canonicalJSON(['file:'+packet.publicationPath])||!Array.isArray(s.group_permissions)||s.group_permissions.length||!Array.isArray(s.permissions)||!s.permissions.length)throw Error('Household grant scope, history, groups or timing differs');
  const recipients=s.permissions.map((/** @type {any} */p)=>p?.allowed_fulcra_userid);
  if(recipients.some((/** @type {any} */id)=>!members.has(id))||new Set(recipients).size!==recipients.length)throw Error('Outgoing household access has an unapproved recipient');
  seen.add(s.datashare_id);recipients.forEach((/** @type {any} */id)=>covered.add(id));receipts.push({grantId:s.datashare_id,recipients:recipients.sort()});
 }
 if([...members].some(id=>!covered.has(id)))throw Error('Current member access grant is missing or revoked');
 return receipts.sort((a,b)=>a.grantId.localeCompare(b.grantId));
}
