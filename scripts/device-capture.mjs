import {createHash} from 'node:crypto';
/** @param {any} config */
function validate(config){
 if(!config||!['home-assistant','purpleair'].includes(config.kind)||!['homeId','equipmentId','metric','id'].every(k=>typeof config[k]==='string'&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(config[k])))throw Error('Configured home, equipment, metric and source IDs required');
 if(config.kind==='home-assistant'&&(!/^[a-z][a-z0-9_]*\.[a-z0-9_]+$/.test(config.entityId)||!['last_reported','last_updated'].includes(config.timestampField??'last_reported')))throw Error('HA entity and explicit report/update timestamp required');
 const fields=['pm2_5_atm','pm2_5_atm_b','pm2_5_cf_1','pm2_5_cf_1_b','current_temp_f','current_humidity','pressure','pm2.5_aqi','pm2.5_aqi_b'];
 if(config.kind==='purpleair'&&(!fields.includes(config.field)||typeof config.sensorId!=='string'||!config.sensorId||config.sensorId.length>150))throw Error('PurpleAir sensor identity and supported field required');
}
/** @param {any} raw */
function timestamp(raw){
 if(typeof raw!=='string')return null;
 // PurpleAir older firmware emits UTC dates with slashes and lower-case z.
 const normalized=raw.replace(/^(\d{4})\/(\d{2})\/(\d{2})T/,'$1-$2-$3T').replace(/z$/,'Z');
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(normalized)||!Number.isFinite(Date.parse(normalized)))return null;
 const [year,month,day]=normalized.slice(0,10).split('-').map(Number);const calendar=new Date(Date.UTC(year,month-1,day));
 if(calendar.getUTCFullYear()!==year||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day)return null;
 return new Date(normalized).toISOString();
}
/** Only the selected value is exported; the full device response stays local.
 * @param {any} config @param {any} body @param {string} receivedAt */
export function adaptDevice(config,body,receivedAt){
 validate(config);if(!body||typeof body!=='object'||Array.isArray(body))return null;
 let value=null,observedAt=null,availability='unknown',sourceTimeBasis='device-clock';
 if(config.kind==='home-assistant'){
  if(body.entity_id!==config.entityId||typeof body.state!=='string')return null;
  const field=config.timestampField??'last_reported';observedAt=timestamp(body[field]);sourceTimeBasis=field==='last_reported'?'controller-report':'controller-update';
  if(body.state==='unavailable')availability='offline';
  else if(body.state!=='unknown'&&body.state.trim()){
   availability='online';value=/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(body.state)?Number(body.state):body.state==='on'?true:body.state==='off'?false:body.state.slice(0,1000);
  }
 }else{
  if(body.SensorId!==config.sensorId)return null;
  observedAt=timestamp(body.DateTime);const selected=body[config.field];
  if(typeof selected==='number'&&Number.isFinite(selected)){value=selected;availability='online';}
 }
 if(typeof value==='number'&&!Number.isFinite(value)){value=null;availability='unknown';}
 const unit=config.unit??(config.kind==='home-assistant'?body.attributes?.unit_of_measurement:'')??'';
 const content={schema:'home-twin-observation/1',homeId:config.homeId,equipmentId:config.equipmentId,metric:config.metric,observedAt,value,unit:typeof unit==='string'?unit.slice(0,40):'',availability,sourceTimeBasis,synthetic:config.synthetic===true};
 const id='capture-'+createHash('sha256').update(JSON.stringify({sourceId:config.id,source:config.kind,entity:config.entityId??config.sensorId,field:config.field??null,...content})).digest('hex');
 return {id,...content,receivedAt};
}
/** A single configured GET; no controller services, redirects, or publishing.
 * @param {any} config @param {string} [token] */
export async function captureDevice(config,token){
 validate(config);let base;try{base=new URL(config.baseUrl);}catch{throw Error('Valid configured base URL required');}
 if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash||!['','/'].includes(base.pathname))throw Error('Base URL must be an HTTP origin without credentials, path or query');
 if(config.kind==='home-assistant'&&(!token||/[\r\n]/.test(token)))throw Error('Private HA credential required');
 const url=new URL(config.kind==='home-assistant'?`/api/states/${config.entityId}`:'/json',base);
 const timeoutMs=config.timeoutMs??10000;if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)throw Error('Capture timeout must be 100–30000 milliseconds');
 let response;
 try{response=await fetch(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:config.kind==='home-assistant'?{Authorization:`Bearer ${token}`,Accept:'application/json'}:{Accept:'application/json'}});}catch{throw Error('Device read unavailable, redirected or timed out');}
 if(!response.ok){await response.body?.cancel();throw Error(`Device read status ${response.status}`);}
 const reader=response.body?.getReader();if(!reader)throw Error('Empty device response');let bytes=0;const chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>65536){await reader.cancel();throw Error('Device response exceeds 64 KiB');}chunks.push(value);}
 let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Invalid device JSON');}
 const observation=adaptDevice(config,body,new Date().toISOString());if(!observation)throw Error('Device response does not match configured identity');return observation;
}
