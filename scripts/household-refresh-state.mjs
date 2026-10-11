import {createHash} from 'node:crypto';
import {canonicalJSON} from '../src/lib/home/canonical-json.js';
import {assertRefreshScope} from '../src/lib/home/household-refresh.js';
export const refreshHash=(/** @type {any} */value)=>createHash('sha256').update(canonicalJSON(value)).digest('hex');
export const refreshBytesHash=(/** @type {string} */value)=>createHash('sha256').update(value).digest('hex');
/** Validate even confirmed state before a different publisher can proceed. @param {any} pointer @param {any} intent */
export function assertConfirmedRefresh(pointer,intent){
 if(pointer?.status==='pending')throw Error('Resolve pending household refresh before another publication');
 if(!pointer||pointer.schema!=='home-twin-refresh-state/1'||pointer.status!=='confirmed'||!intent)throw Error('Household refresh state unknown; preserve and inspect');
 const {integrity,...body}=pointer,{intentId,...payload}=intent;
 if(refreshHash(body)!==integrity||refreshHash(payload)!==intentId||intentId!==pointer.intentId||intent.schema!=='home-twin-refresh-intent/1'||pointer.packetDigest!==refreshHash(intent.packet)||intent.packetDigest!==pointer.packetDigest||['homeId','principalId','root'].some(k=>pointer[k]!==intent[k])||pointer.operations?.backup!=='confirmed'||pointer.operations?.publication!=='confirmed')throw Error('Household refresh state integrity differs');
 assertRefreshScope(intent.packet);
 if(intent.homeId!==intent.packet.homeId||intent.principalId!==intent.packet.ownerUserId||intent.root!==intent.packet.baseline.root||intent.targetText!==JSON.stringify(intent.packet.publication)||refreshBytesHash(intent.targetText)!==intent.packet.publicationDigest)throw Error('Household refresh intent scope differs');
 assertRefreshPrior(intent);
}

/** Prior publication must be a lower accepted revision, never a silent rollback. @param {any} intent */
export function assertRefreshPrior(intent){
 let prior;try{prior=JSON.parse(intent.priorText);}catch{throw Error('Prior publication JSON unreadable; preserve intent');}
 if(prior?.id!==intent.homeId||prior.ownerUserId!==intent.principalId||!Number.isSafeInteger(prior.revision)||prior.revision<1||prior.revision>=intent.packet.baseline.revision)throw Error('Prior publication revision or identity is divergent; inspect before refresh');
 if(refreshBytesHash(canonicalJSON(intent.packet.publication.members))!==intent.packet.membersDigest)throw Error('Reviewed members digest differs');
 if(!Array.isArray(intent.receipts)||!intent.receipts.length)throw Error('Prior outgoing grant receipts unavailable');
 const ids=new Set(),covered=new Set(),members=new Set(intent.packet.publication.members.map((/** @type {any} */m)=>m.userId));
 for(const receipt of intent.receipts){if(typeof receipt?.grantId!=='string'||!receipt.grantId||ids.has(receipt.grantId)||!Array.isArray(receipt.recipients)||!receipt.recipients.length||receipt.recipients.some((/** @type {any} */id)=>!members.has(id))||new Set(receipt.recipients).size!==receipt.recipients.length)throw Error('Prior outgoing grant receipts differ');ids.add(receipt.grantId);receipt.recipients.forEach((/** @type {any} */id)=>covered.add(id));}
 if([...members].some(id=>!covered.has(id)))throw Error('Prior outgoing member grant receipts incomplete');
}
