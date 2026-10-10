import {createHash} from 'node:crypto';
import {MAX_SOURCE_BYTES,SOURCE_TYPES,attachmentPath} from '../home/attachments.js';
import {canonicalJSON} from '../home/canonical-json.js';
/** @param {Uint8Array} bytes @param {string} type */
function verifyType(bytes,type){
 if(!bytes.length||bytes.length>MAX_SOURCE_BYTES||!Object.hasOwn(SOURCE_TYPES,type))throw new Error('Use a PNG, JPEG, WebP, PDF or UTF-8 note up to 3 MiB');
 const start=Buffer.from(bytes.subarray(0,12));let valid=false;
 if(type==='image/png')valid=start.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(type==='image/jpeg')valid=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(type==='image/webp')valid=start.toString('ascii',0,4)==='RIFF'&&start.toString('ascii',8,12)==='WEBP';
 if(type==='application/pdf')valid=start.toString('ascii',0,5)==='%PDF-';
 if(type==='text/plain'){try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);valid=!bytes.includes(0);}catch{valid=false;}}
 if(!valid)throw new Error('File content does not match its supported type');
}
/** Persist an immutable source in the caller's account; IO binds that same token.
 * @param {any} access @param {any} input @param {Uint8Array} bytes
 * @param {string} mimeType @param {string} originalName @param {any} io */
async function persistEvidence(access,input,bytes,mimeType,originalName,io){
 if(!['maintainer','contributor'].includes(access.role))throw new Error('This home is read-only for you');
 if(!access.home||input.homeId!==access.home.id)throw new Error('Choose the connected home');
 if(input.entityId&&!access.home.equipment?.some((/** @type {any} */ e)=>e.id===input.entityId))throw new Error('Choose known equipment');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id)||typeof input.title!=='string'||!input.title.trim()||input.title.length>500||typeof originalName!=='string'||originalName.length>200)throw new Error('A stable ID, title and supported filename are required');
 verifyType(bytes,mimeType);
 const attachment={sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.byteLength,mimeType,extension:SOURCE_TYPES[mimeType],originalName};
 const payload={id:input.id,homeId:input.homeId,kind:'evidence',value:input.title.trim(),...(input.entityId?{entityId:input.entityId}:{}),attachment};
 const rawPath=attachmentPath(access.root,input.id,attachment);
 const metaPath=`${access.root}/contributions/${input.id}-${createHash('sha256').update(canonicalJSON(payload)).digest('hex')}.json`;
 /** @param {any} saved */
 const same=(saved)=>{const compare={...saved};delete compare.authorUserId;delete compare.recordedAt;if(compare.kind==='evidence-upload')compare.kind='evidence';return saved.authorUserId===access.userId&&canonicalJSON(compare)===canonicalJSON(payload);};
 let matches=(await io.list()).filter((/** @type {any} */ row)=>row?.id===input.id);
 if(matches.length&&(matches.length!==1||!same(matches[0])))throw new Error('This source ID already has different content');
 let bound=matches[0];
 if(!bound){
  // Reserve the exact payload durably before storing original bytes. An
  // interrupted upload can resume only this same file and metadata.
  bound={...payload,kind:'evidence-upload',authorUserId:access.userId,recordedAt:new Date().toISOString()};
  await io.write(metaPath,new TextEncoder().encode(JSON.stringify(bound)),'application/json');
  const intent=await io.read(metaPath);if(!intent||canonicalJSON(JSON.parse(new TextDecoder().decode(intent)))!==canonicalJSON(bound))return {status:'pending-readback',id:input.id};
  matches=(await io.list()).filter((/** @type {any} */ row)=>row?.id===input.id);
  if(matches.length>1||matches.some((/** @type {any} */ row)=>!same(row)))throw new Error('This source ID already has different content');
  if(matches.length!==1)return {status:'pending-readback',id:input.id};
  bound=matches[0];
 }
 const existing=await io.read(rawPath);
 if(existing){if(createHash('sha256').update(existing).digest('hex')!==attachment.sha256)throw new Error('Original source has different content');}
 else if(bound.kind==='evidence')throw new Error('Original source is unavailable; retry cannot confirm it');
 else await io.write(rawPath,bytes,mimeType);
 const raw=await io.read(rawPath);if(!raw||createHash('sha256').update(raw).digest('hex')!==attachment.sha256)return {status:'pending-readback',id:input.id};
 if(bound.kind==='evidence')return {status:'saved',id:input.id,reused:true};
 const record={...payload,authorUserId:access.userId,recordedAt:bound.recordedAt};
 await io.write(metaPath,new TextEncoder().encode(JSON.stringify(record)),'application/json');
 const readback=await io.read(metaPath);
 matches=(await io.list()).filter((/** @type {any} */ row)=>row?.id===input.id);
 if(matches.length>1||matches.some((/** @type {any} */ row)=>!same(row)))throw new Error('This source ID already has different content');
 return {status:matches.length===1&&readback&&canonicalJSON(JSON.parse(new TextDecoder().decode(readback)))===canonicalJSON(record)?'saved':'pending-readback',id:input.id};
}

/** Runtime-local serialization prevents duplicate work from concurrent retries.
 * Fulcra file versions remain the cross-runtime recovery record; no distributed
 * conditional transaction is claimed here. */
const inflight=/** @type {Map<string,Promise<void>>} */ (new Map());
/** @param {any} access @param {any} input @param {Uint8Array} bytes @param {string} mimeType @param {string} originalName @param {any} io */
export async function saveEvidence(access,input,bytes,mimeType,originalName,io){
 const key=`${access.userId}|${access.root}|${input.id}`;const previous=inflight.get(key)??Promise.resolve();
 let release=()=>{};const gate=new Promise((/** @type {(value?:any)=>void} */ resolve)=>{release=resolve;});
 const tail=previous.then(()=>gate);inflight.set(key,tail);await previous;
 try{return await persistEvidence(access,input,bytes,mimeType,originalName,io);}
 finally{release();if(inflight.get(key)===tail)inflight.delete(key);}
}
