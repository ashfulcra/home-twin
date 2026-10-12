/** Applicant uses only their own current incoming shares. Outcome never proves
 * home access; the normal home read still checks live grant and membership.
 * @param {any} client @param {any} target @param {string} userId @param {string} requestId */
export async function readJoinOutcome(client,target,userId,requestId){
 const incoming=await client.incoming();if(!Array.isArray(incoming)||incoming.length>5000)throw Error('Outcome discovery incomplete');
 const prefix='file:/shared/home-twin/'+target.homeId+'/join-status/'+requestId+'-',codes=new Set(),outcomes=new Set();
 for(const grant of incoming){
  if(grant?.sharing_fulcra_userid!==target.ownerUserId||grant.grant_type==='self')continue;
  if(!Array.isArray(grant.fulcra_data_types))throw Error('Owner incoming grant metadata incomplete');
  const paths=grant.fulcra_data_types.filter((/** @type {any} */v)=>typeof v==='string'&&v.startsWith(prefix));
  if(!paths.length)continue;
  if(grant.grant_type!=='user'||grant.group_id!==null||grant.share_all_data!==false||grant.time_start!==null||grant.time_end!==null||grant.fulcra_data_types.length!==1||paths.length!==1||!/^[a-f0-9-]{36}-[a-f0-9]{64}\.json$/.test(paths[0].slice(prefix.length)))throw Error('Outcome grant scope differs');
  if(codes.has(paths[0]))continue;codes.add(paths[0]);if(codes.size>100)throw Error('Outcome discovery exceeds limit');
  const file=await client.file(paths[0].slice(5),target.ownerUserId,8192);if(!file)throw Error('Addressed outcome unavailable');
  let value;try{value=JSON.parse(file.text);}catch{throw Error('Outcome unreadable');}
  if(value.schema!=='home-twin-join-outcome/1'||value.homeId!==target.homeId||value.ownerUserId!==target.ownerUserId||value.recipientUserId!==userId||value.requestId!==requestId||value.reviewId!==paths[0].slice(prefix.length,prefix.length+36)||!['approve','reject'].includes(value.decision)||value.decision==='approve'&&!['viewer','contributor'].includes(value.role)||value.decision==='reject'&&value.role!==null)throw Error('Outcome record scope differs');
  outcomes.add(value.decision);
 }
 if(outcomes.size>1)throw Error('Conflicting owner outcomes need review');
 return outcomes.has('reject')?'request-rejected':'pending-approval';
}
