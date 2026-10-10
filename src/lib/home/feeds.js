/** @param {any} input */
export function validateFeed(input){
 if(!input||!/^MomentAnnotation\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.dataType)||typeof input.id!=='string'||!(/^[a-z0-9-]{1,80}$/).test(input.id)||typeof input.name!=='string'||input.name.length>120)throw new Error('Choose a configured Fulcra moment observation type');
 if(!Number.isFinite(input.freshnessSeconds)||input.freshnessSeconds<30||input.freshnessSeconds>604800)throw new Error('Freshness must be 30 seconds to 7 days');
 return {id:input.id,name:input.name,dataType:input.dataType,freshnessSeconds:input.freshnessSeconds,...(typeof input.equipmentId==='string'?{equipmentId:input.equipmentId}:{}),...(typeof input.metric==='string'?{metric:input.metric}:{}),...(typeof input.sourceUserId==='string'?{sourceUserId:input.sourceUserId}:{})};
}
/** @param {{freshnessSeconds:number}} feed */
export function feedWindowSeconds(feed){return Math.max(86400,feed.freshnessSeconds+86400);}
/** Prefer an actual, nonfuture receipt deterministically across duplicate deliveries.
 * @param {any} p @param {number} now */
function receiptRank(p,now){const t=Date.parse(p.receivedAt);return Number.isFinite(t)&&t<=now?t:Number.POSITIVE_INFINITY;}
/** @param {any} record */
export function normalizeObservation(record){
 let p=record;if(typeof record?.note==='string'){try{p=JSON.parse(record.note);}catch{return null;}}
 if(!p||p.schema!=='home-twin-observation/1'||typeof p.id!=='string'||!p.id||p.id.length>150||typeof p.equipmentId!=='string'||p.equipmentId.length>100)return null;
 if(!['number','string','boolean'].includes(typeof p.value)&&p.value!==null)return null;if(typeof p.value==='number'&&!Number.isFinite(p.value))return null;if(typeof p.value==='string'&&p.value.length>1000)return null;
 return {schema:p.schema,id:p.id,homeId:p.homeId,equipmentId:p.equipmentId,metric:p.metric??null,observedAt:p.observedAt??null,receivedAt:p.receivedAt??null,fulcraRecordedAt:record.recorded_at??null,value:p.value,unit:typeof p.unit==='string'?p.unit.slice(0,40):'',availability:['online','offline'].includes(p.availability)?p.availability:'unknown',sourceTimeBasis:['controller-report','controller-update','device-clock'].includes(p.sourceTimeBasis)?p.sourceTimeBasis:null,synthetic:p.synthetic===true};
}
/** Observation ordering is independent of arrival order. Conflicting IDs stay explicit.
 * @param {any} feed @param {any[]} records @param {string} asOf */
export function projectFeed(feed,records,asOf){
 const now=Date.parse(asOf);const unique=new Map();const conflicts=new Set();let invalidCount=0;
 for(const record of records){const p=normalizeObservation(record);if(!p){invalidCount++;continue;}if(feed.homeId&&p.homeId!==feed.homeId)continue;if(feed.equipmentId&&p.equipmentId!==feed.equipmentId)continue;if(feed.metric&&p.metric!==feed.metric)continue;
  // Fulcra may have multiple delivery records for one source event; its record time is not event identity.
  const previous=unique.get(p.id);const payload={...p,fulcraRecordedAt:null,receivedAt:null};
  if(previous&&JSON.stringify({...previous,fulcraRecordedAt:null,receivedAt:null})!==JSON.stringify(payload))conflicts.add(p.id);
  else if(!previous||receiptRank(p,now)<receiptRank(previous,now)||(receiptRank(p,now)===receiptRank(previous,now)&&JSON.stringify(p).localeCompare(JSON.stringify(previous))<0))unique.set(p.id,p);
 }
 const all=[...unique.values()].filter(p=>!conflicts.has(p.id));const valid=all.filter(p=>Number.isFinite(Date.parse(p.observedAt))&&Date.parse(p.observedAt)<=now&&(!p.receivedAt||Date.parse(p.receivedAt)<=now));
 const latest=valid.sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt)||a.id.localeCompare(b.id))[0]??all[0]??null;
 const state=conflicts.size?'conflict':!latest?(invalidCount?'unknown':'no-data'):!valid.includes(latest)?'unknown':latest.availability==='offline'?'offline':latest.availability!=='online'||latest.value===null?'unknown':now-Date.parse(latest.observedAt)>feed.freshnessSeconds*1000?'stale':'recent';
 return {...feed,latest,state,count:unique.size,invalidCount,conflictCount:conflicts.size,syncedAt:asOf};
}
