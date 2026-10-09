/** Immutable contributions are reconciled against a baseline; conflicting new
 * values are held together rather than resolved by arrival order.
 * @param {any} baseline @param {any[]} contributions
 */
export function reconcileContributions(baseline, contributions) {
 const home=structuredClone(baseline);
 home.notes??=[];home.history??=[];home.contributionEvidence??=[];
 /** @type {string[]} */ const accepted=[];
 /** @type {any[]} */ const review=[];
 const unique=new Map();const collisions=new Set();
 for(const c of contributions){
  if(c.homeId!==home.id)continue;
  if(unique.has(c.id)&&JSON.stringify(unique.get(c.id))!==JSON.stringify(c))collisions.add(c.id);
  else unique.set(c.id,c);
 }
 const rows=[...unique.values()];
 /** @param {any} c @param {string} reason */
 const hold=(c,reason)=>review.push({contribution:c,reason});
 const fields=new Set(['model','manufacturer','serial','capacity','installedAt']);
 for(const c of rows){
  if(collisions.has(c.id)){hold(c,'id-collision');continue;}
  if(!c.authorUserId||!c.id){hold(c,'missing-provenance');continue;}
  const entity=home.equipment?.find((/** @type {any} */ item)=>item.id===c.entityId);
  if(c.entityId&&!entity){hold(c,'unknown-entity');continue;}
  if(c.kind==='fact'&&c.baseRevision!==undefined&&c.baseRevision!==home.revision){hold(c,'stale-base-revision');continue;}
  if(c.kind==='geometry'){hold(c,'major-model-change');continue;}
  if(c.kind==='note'){
   if(typeof c.text!=='string'||!c.text.trim()){hold(c,'empty-note');continue;}
   if(!home.notes.some((/** @type {any} */ n)=>n.id===c.id))home.notes.push({...c});
  }else if(c.kind==='fact'){
   if(!entity||!fields.has(c.field)||typeof c.value!=='string'||!c.value.trim()){hold(c,'unsupported-fact');continue;}
   const competing=rows.filter(other=>other.kind==='fact'&&other.entityId===c.entityId&&other.field===c.field);
   const conflict=new Set(competing.map(other=>other.value)).size>1;
   if(conflict || (entity[c.field]!=null&&entity[c.field]!==c.value)){hold(c,'contradiction');continue;}
   entity[c.field]=c.value;
  }else if(c.kind==='maintenance'){
   const performed=Date.parse(c.performedAt);const recorded=Date.parse(c.recordedAt);
   if(!Number.isFinite(performed)||!Number.isFinite(recorded)||performed>recorded){hold(c,'missing-service-date');continue;}
   if(!home.history.some((/** @type {any} */ h)=>h.id===c.id))home.history.push({...c,equipmentId:c.entityId,status:'completed',summary:c.text});
  }else{hold(c,'review-required');continue;}
  accepted.push(c.id);
  if(!home.contributionEvidence.some((/** @type {any} */ e)=>e.id===c.id))home.contributionEvidence.push({...c});
 }
 return {home,accepted,review};
}

/** Accept only portable data, never paths, authority claims or commands.
 * @param {any} input */
export function validateContribution(input) {
 if(!input||typeof input!=='object'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id))throw new Error('A stable contribution ID is required');
 if(typeof input.homeId!=='string'||!input.homeId||input.homeId.length>100)throw new Error('Choose a home');
 if(!['note','fact','maintenance','geometry'].includes(input.kind))throw new Error('Unsupported contribution type');
 /** @type {any} */ const result={id:input.id,homeId:input.homeId,kind:input.kind};
 if(input.baseRevision!==undefined){if(!Number.isSafeInteger(input.baseRevision)||input.baseRevision<0)throw new Error('Invalid base revision');result.baseRevision=input.baseRevision;}
 for(const field of ['entityId','field','value','text','performedAt']){
  if(input[field]!==undefined){if(typeof input[field]!=='string'||input[field].length>(field==='text'?10000:500))throw new Error('Contribution is too long or invalid');result[field]=input[field].trim();}
 }
 if(['note','geometry','maintenance'].includes(input.kind)&&!result.text)throw new Error('Add a description');
 if(input.kind==='fact'&&(!result.entityId||!['model','manufacturer','serial','capacity','installedAt'].includes(result.field)||!result.value))throw new Error('Choose equipment and a supported fact');
 if(input.kind==='maintenance'&&(!Number.isFinite(Date.parse(result.performedAt))||Date.parse(result.performedAt)>Date.now()))throw new Error('Enter the actual past service date');
 return result;
}
