import {join} from 'node:path';import {readFileSync,lstatSync,readdirSync} from 'node:fs';import {createHash} from 'node:crypto';
import {assertConfirmedAdmissionState} from './admission-journal.mjs';import {assertConfirmedRefresh} from './household-refresh-state.mjs';import {canonicalJSON} from '../src/lib/home/canonical-json.js';
/** @param {string} path @returns {any} */
export function readPrivateWriterState(path){try{const st=lstatSync(path);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)||st.size>10*1024*1024)throw Error('Private bounded writer journal required');return JSON.parse(readFileSync(path,'utf8'));}catch(e){if(e&&typeof e==='object'&&'code' in e&&e.code==='ENOENT')return null;throw e;}}
const hash=(/** @type {any} */v)=>createHash('sha256').update(canonicalJSON(v)).digest('hex');
/** Called while holding the existing maintainer lock. No separate outcome or
 * rejection can contradict a not-yet-confirmed canonical/publication/grant.
 * @param {string} directory @param {any} target */
export function assertAccessWritersConfirmed(directory,target){
 const scope={homeId:target.homeId,principalId:target.ownerUserId,root:target.root};
 for(const [kind,folder] of [['admission','admissions'],['household-refresh','household-refresh'],['publication','publications']]){
  const pointer=readPrivateWriterState(join(directory,kind+'.json'));if(!pointer)continue;
  if(pointer.status==='pending')throw Error('Resolve pending '+kind+' before another access outcome or rejection');
  if(pointer.status!=='confirmed'||Object.entries(scope).some(([k,v])=>pointer[k]!==v)||!/^[a-f0-9]{64}$/.test(pointer.intentId??''))throw Error('Writer state scope or integrity differs');
  const intent=readPrivateWriterState(join(directory,folder,pointer.intentId+'.json'));if(kind==='admission')assertConfirmedAdmissionState(pointer,intent);
  else if(kind==='household-refresh')assertConfirmedRefresh(pointer,intent);
  else {if(!intent||intent.schema!=='home-twin-publication/1')throw Error('Publication intent unavailable');const {intentId,...payload}=intent;if(hash(payload)!==intentId||intentId!==pointer.intentId||hash(intent.target)!==intent.targetDigest||hash(intent.base)!==intent.baseDigest||Object.entries(scope).some(([k,v])=>intent[k]!==v)||pointer.result?.confirmed!==true||pointer.result.intentId!==intentId)throw Error('Confirmed publication integrity differs');}
 }
}

/** Under the same writer lock, absence of any immutable intent for this review
 * proves this executor has not begun its remote mutations. Unknown files hold.
 * @param {string} directory @param {string} code */
export function admissionForReviewStarted(directory,code){
 const pointer=readPrivateWriterState(join(directory,'admission.json'));
 if(pointer){if(!/^[a-f0-9]{64}$/.test(pointer.intentId??'')||!['pending','confirmed'].includes(pointer.status))throw Error('Admission pointer unknown');const intent=readPrivateWriterState(join(directory,'admissions',pointer.intentId+'.json'));if(!intent)throw Error('Admission pointer intent unavailable');if(intent.packet.reviewId+'-'+intent.packet.reviewDigest===code)return true;}
 let names;try{const folder=join(directory,'admissions'),st=lstatSync(folder);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077))throw Error('Private immutable admission folder required');names=readdirSync(folder);}catch(e){if(e&&typeof e==='object'&&'code' in e&&e.code==='ENOENT')return false;throw e;}
 if(names.length>1000)throw Error('Admission journal inspection exceeds limit');
 for(const name of names){if(!/^[a-f0-9]{64}\.json$/.test(name))throw Error('Unknown immutable admission record');const intent=readPrivateWriterState(join(directory,'admissions',name));if(!intent||intent.schema!=='home-twin-admission-intent/1')throw Error('Immutable admission record unreadable');const {intentId,...payload}=intent;if(hash(payload)!==intentId||intentId+'.json'!==name)throw Error('Immutable admission integrity differs');if(intent.packet.reviewId+'-'+intent.packet.reviewDigest===code)return true;}
 return false;
}
