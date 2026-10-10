import {attachmentPath} from '../home/attachments.js';
/** @param {any} access @param {any} source */
export function sourceLocation(access,source){
 if(source.attachment){
  const userId=source.sourceUserId??source.authorUserId;
  if(!userId||(userId!==access.ownerUserId&&!access.home.members?.some((/** @type {any} */ m)=>m.userId===userId&&m.role==='contributor')))throw new Error('Source contributor access is unavailable or revoked');
  return {userId,path:attachmentPath(access.root,source.contributionId,source.attachment)};
 }
 if(typeof source.path!=='string'||!source.path.startsWith('/')||(access.ownerUserId!==access.userId&&!source.path.startsWith(`${access.root}/sources/`)))throw new Error('Source is outside the shared home folder');
 return {userId:access.ownerUserId,path:source.path};
}
