/** @param {any} input */
export function validateConnection(input) {
 if(!input||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.ownerUserId)||!(/^[a-z0-9][a-z0-9-]{0,79}$/).test(input.homeId))throw new Error('Enter the maintainer’s Fulcra user ID and home ID');
 return {ownerUserId:input.ownerUserId,homeId:input.homeId,root:`/shared/home-twin/${input.homeId}`};
}
/** @param {any} home @param {string} userId */
export function homeRole(home,userId) {
 if(home.ownerUserId===userId)return 'maintainer';
 const role=home.members?.find((/** @type {any} */ member)=>member.userId===userId)?.role;
 return ['viewer','contributor'].includes(role)?role:null;
}
/** @param {any[]} rows @param {string} sourceUserId */
export function attributeSharedRows(rows,sourceUserId) {
 return rows.map(row=>!row||typeof row!=='object'||Array.isArray(row)?null:({...row,sourceUserId,authorUserId:row.authorUserId===sourceUserId?sourceUserId:null}));
}
