import {createHash} from 'node:crypto';
/** Current caller only. No CLI credential fallback or persisted token. */
/** @param {string} token @param {typeof fetch} [send] */
export function accessFulcraClient(token,send=fetch){
 if(typeof token!=='string'||token.length<8||token.length>16384)throw Error('Current caller authentication required');
 const endpoint='https://api.fulcradynamics.com/';
 /** @param {string} path @param {any} [body] */
 async function api(path,body){const r=await send(endpoint+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Fulcra access operation status '+r.status);return r;}
 /** @param {Response} r @param {number} limit */
 async function bounded(r,limit){if(Number(r.headers.get('content-length')??0)>limit||!r.body)throw Error('Access file exceeds limit or unavailable');const reader=r.body.getReader(),chunks=[];let size=0;try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>limit){await reader.cancel();throw Error('Access file exceeds limit');}chunks.push(p.value);}}finally{reader.releaseLock();}return Buffer.concat(chunks).toString('utf8');}
 /** @param {string} folder @param {string} [account] @returns {Promise<any[]>} */
 async function list(folder,account){const value=await(await api('input/v1/file_upload?state=uploaded&path='+encodeURIComponent(folder)+(account?'&fulcra_userid='+encodeURIComponent(account):''))).json();if(!Array.isArray(value.files)||value.files.length>5000)throw Error('Access file discovery incomplete');return value.files;}
 /** @param {string} path @param {string} [account] @param {number} [limit] */
 async function file(path,account,limit=2*1024*1024){const split=path.lastIndexOf('/'),files=(await list(path.slice(0,split),account)).filter((/** @type {any} */f)=>f.name===path.slice(split+1));if(!files.length)return null;if(files.length!==1||typeof files[0].id!=='string')throw Error('Access file metadata ambiguous');return {id:files[0].id,text:await bounded(await api('input/v1/file_upload/'+encodeURIComponent(files[0].id)+'/download'+(account?'?fulcra_userid='+encodeURIComponent(account):'')),limit)};}
 /** @param {string} path @param {string} text */
 async function write(path,text){if(Buffer.byteLength(text)>2*1024*1024)throw Error('Access file exceeds write limit');const split=path.lastIndexOf('/'),bytes=Buffer.from(text),upload=await(await api('input/v1/file_upload',{path:path.slice(0,split),name:path.slice(split+1),content_type:'application/json',content_length:bytes.length})).json();const url=new URL(upload.url);if(url.protocol!=='https:')throw Error('Secure upload URL required');const r=await send(url,{method:'POST',headers:{'Content-Type':'application/json','Content-Length':String(bytes.length)},body:bytes,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Access upload status '+r.status);}
 return {incoming:async()=>{const v=await(await api('user/v1/dataset')).json();if(!Array.isArray(v))throw Error('Incoming share discovery incomplete');return v;},principal:async()=>{const v=await(await api('user/v1alpha1/info')).json();return v.userid;},list,file,write,
 listShares:async()=>{const v=await(await api('user/v1/datashare')).json();if(!Array.isArray(v))throw Error('Outgoing share discovery incomplete');return v;},
 createShare:async (/** @type {any} */body)=>(await api('user/v1/datashare',body)).json()};
}
/** @param {any} client @param {any} target @param {string} userId */
export function automaticJoinTransport(client,target,userId){
 const root='/shared/home-twin/'+target.homeId+'/join-requests/';
 const allowed=(/** @type {string} */p)=>typeof p==='string'&&p.startsWith(root)&&/^[a-f0-9-]{36}-[a-f0-9]{64}\.json$/.test(p.slice(root.length));
 return {principal:client.principal,requests:async()=>{const files=await client.list(root.slice(0,-1));if(files.length>100)throw Error('Existing request discovery exceeds limit');const rows=[];for(const f of files){if(!allowed(root+f.name))throw Error('Unknown existing request record');const file=await client.file(root+f.name,undefined,8192);if(!file||createHash('sha256').update(file.text).digest('hex')!==f.name.slice(37,-5))throw Error('Existing request bytes differ');rows.push(JSON.parse(file.text));}return rows;},
 readFile:async (/** @type {string} */p)=>{if(!allowed(p))throw Error('Request path outside configured home');return (await client.file(p,undefined,8192))?.text??null;},
 writeFile:async(/** @type {string} */p,/** @type {string} */text)=>{if(!allowed(p)||JSON.parse(text).authorUserId!==userId)throw Error('Request upload outside current caller');return client.write(p,text);},
 listShares:client.listShares,
 createShare:async (/** @type {any} */b)=>{if(b.permissions?.length!==1||b.permissions[0].allowed_fulcra_userid!==target.ownerUserId||b.fulcra_user_name!==userId||b.fulcra_data_types?.length!==1||!allowed(b.fulcra_data_types[0].slice(5))||!b.fulcra_data_types[0].startsWith('file:')||b.share_all_data!==false||b.group_permissions?.length||b.time_start!==null||b.time_end!==null)throw Error('Request share outside exact scope');return client.createShare(b);}};
}
