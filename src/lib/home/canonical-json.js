/** Deterministic exact payload comparison; this is not authentication.
 * @param {any} value @returns {string} */
export function canonicalJSON(value){
 if(Array.isArray(value))return '['+value.map(canonicalJSON).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonicalJSON(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
