/** Explicit project roots are bounded; defaults still use the named shared home.
 * @param {string} homeId @param {string} root */
export function validHomeRoot(homeId,root){
 return /^[a-z0-9][a-z0-9-]{0,79}$/.test(homeId)&&typeof root==='string'&&
 (root==='/home/twin'||root===`/shared/home-twin/${homeId}`||/^\/[A-Za-z0-9_-]{1,80}\/twin$/.test(root));
}
