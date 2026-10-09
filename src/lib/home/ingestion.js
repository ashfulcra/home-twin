import {attributeSharedRows} from './access.js';
/** Read only registered contributor folders using the current maintainer's token.
 * @param {any} home @param {string} userId @param {(userId:string)=>Promise<any[]>} readRows */
export async function ingestHome(home,userId,readRows){
 if(home.ownerUserId!==userId)throw new Error('Only the authenticated home maintainer can ingest household contributions');
 const rows=attributeSharedRows(await readRows(userId),userId);const unavailableMembers=[];
 for(const member of home.members??[]){
  if(member.role!=='contributor'||member.userId===userId)continue;
  try{rows.push(...attributeSharedRows(await readRows(member.userId),member.userId));}
  catch{unavailableMembers.push(member.userId);}
 }
 return {rows,unavailableMembers};
}
