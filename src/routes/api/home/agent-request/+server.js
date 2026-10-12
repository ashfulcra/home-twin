import {error,json} from '@sveltejs/kit';
import {resolveHome} from '$lib/server/home-access.js';
import {writeFulcraJSON} from '$lib/server/fulcra-files.js';
import {buildAgentBrief} from '$lib/home/agent-brief.js';
import {loadAssemblyPreview} from '$lib/server/assembly-preview.js';
import {assemblyPreviewReader} from '$lib/server/assembly-preview-reader.js';
export async function GET({cookies}){
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in first');
 const access=await resolveHome(token);if(!access.home)throw error(404,'Set up your home first');
 /** @type {any} */const options={role:access.role,root:access.root,ownerUserId:access.ownerUserId,userId:access.userId};
 if(access.role==='maintainer'&&access.userId===access.ownerUserId&&access.home.ownerUserId===access.userId){
  try{options.assemblyReference=await loadAssemblyPreview(access,assemblyPreviewReader(access.endpoint,token,access.root),()=>resolveHome(token));}
  catch{options.assemblyReference={status:'unverified'};}
  // A source failure cannot authorize exporting an accepted snapshot whose access changed during IO.
  const current=await resolveHome(token);
  if(current.userId!==access.userId||current.ownerUserId!==access.ownerUserId||current.role!==access.role||current.root!==access.root||current.home?.id!==access.home.id||current.home?.ownerUserId!==access.home.ownerUserId||current.file?.id!==access.file?.id||current.file?.text!==access.file?.text)
    throw error(409,'Home access or records changed during the brief check. Refresh before downloading.');
 }
 const brief=buildAgentBrief(access.home,options);
 return json(brief,{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`attachment; filename="home-agent-brief-${encodeURIComponent(access.home.id)}.json"`}});
}
export async function POST({cookies}) {
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in first');
 const access=await resolveHome(token);if(!access.home)throw error(404,'Set up your home first');
 const request={schemaVersion:1,homeId:access.home.id,ownerUserId:access.ownerUserId,requestedBy:access.userId,requestedAt:new Date().toISOString(),status:'awaiting-agent-connection',scope:'Maintain home facts, equipment, contacts, care history and correctable model. Preserve original evidence. Routine contributions may be projected; contradictions and major model changes require review.'};
 await writeFulcraJSON(access.endpoint,token,`${access.root}/agent-request.json`,request);
 return json({status:request.status,homeId:request.homeId});
}
