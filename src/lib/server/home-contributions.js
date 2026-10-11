import {listFulcraJSON} from './fulcra-files.js';
import {createHash} from 'node:crypto';
import {canonicalJSON} from '../home/canonical-json.js';
import {attributeSharedRows} from '../home/access.js';
/** Inbound reads always use the current caller token and registered membership.
 * @param {any} access @param {string} token */
export async function readHomeContributions(access,token){
 const own=await listFulcraJSON(access.endpoint,token,`${access.root}/contributions`);
 const rows=attributeSharedRows(own,access.userId);const unavailable=[];
 if(access.role==='maintainer')for(const member of access.home.members??[]){
  if(member.role!=='contributor'||member.userId===access.userId)continue;
  try{rows.push(...attributeSharedRows(await listFulcraJSON(access.endpoint,token,`/shared/home-twin/${access.home.id}/contributions`,member.userId),member.userId));}catch{unavailable.push(member.userId);}
 }
 if(access.role!=='maintainer'){const receipts=new Map((access.home.publicationEvidence??[]).map((/** @type {any} */ r)=>[r.id,r.digest]));return {rows:rows.filter(row=>{if(!row||!receipts.has(row.id))return true;const exact=receipts.get(row.id)===createHash('sha256').update(canonicalJSON(row)).digest('hex');if(!exact)row.publishedDigestMismatch=true;return !exact;}),unavailable};}
 return {rows,unavailable};
}
