import {canonicalJSON} from './canonical-json.js';
/** Exact outgoing receipt is not proof of member delivery. Unknown shapes fail closed.
 * @param {any[]} shares @param {any} body */
export function exactAdmissionShare(shares,body){
 if(!Array.isArray(shares))throw Error('Outgoing grants unavailable');const matches=shares.filter(s=>s.datashare_name===body.datashare_name);if(matches.length>1)throw Error('Duplicate named grants need owner inspection');if(!matches.length)return null;const s=matches[0];
 if(typeof s.datashare_id!=='string'||!s.datashare_id||s.share_all_data!==false||s.fulcra_user_name!==body.fulcra_user_name||s.time_start!==null||s.time_end!==null||!Array.isArray(s.fulcra_data_types)||canonicalJSON(s.fulcra_data_types)!==canonicalJSON(body.fulcra_data_types)||!Array.isArray(s.permissions)||s.permissions.length!==1||s.permissions[0].allowed_fulcra_userid!==body.permissions[0].allowed_fulcra_userid||!Array.isArray(s.group_permissions)||s.group_permissions.length)throw Error('Named grant scope or recipient differs; inspect without widening or revoking');return s.datashare_id;
}
