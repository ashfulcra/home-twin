import {mkdirSync,lstatSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validHomeRoot} from '../src/lib/home/home-root.js';
/** Metadata-only local persistence evidence; not scheduler, authentication or delivery proof.
 * Caller must hold the existing maintainer lock and validate the retained report first.
 * @param {string} directory @param {any} input */
export function persistInspectionReceipt(directory,input){
 const {kind,scope,reportId,observedAt,summary}=input;
 if(!['maintainer-cycle','owner-join-inbox'].includes(kind)||!scope||typeof scope.principalId!=='string'||!scope.principalId||!validHomeRoot(scope.homeId,scope.root)||typeof reportId!=='string'||!/^[a-f0-9]{64}$/.test(reportId)||observedAt!=null&&(typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt))))throw Error('Valid scoped inspection receipt metadata required');
 const countKeys=['sourceCheckCount','changedSourceCount','unverifiedSourceCount','unavailableSourceCount','outOfScopeSourceCount','unavailableMemberCount','attentionCount','unavailableCount','unsupportedCount'];
 const flagKeys=['sourceAuditRequested','more','reviewIncomplete'];
 if(!summary||typeof summary!=='object'||Array.isArray(summary)||Object.entries(summary).some(([key,value])=>countKeys.includes(key)?!Number.isSafeInteger(value)||Number(value)<0:flagKeys.includes(key)?typeof value!=='boolean':true))throw Error('Bounded inspection summary required');
 /** @param {string} path */
 function privateDirectory(path){const st=lstatSync(path);if(st.isSymbolicLink()||!st.isDirectory()||(st.mode&0o077))throw Error('Private non-symlink inspection directory required');}
 privateDirectory(directory);const folder=join(directory,'inspection-receipts');mkdirSync(folder,{recursive:true,mode:0o700});privateDirectory(folder);
 const id=randomUUID();const receipt={schema:'home-twin-inspection-receipt/1',id,kind,scope:{homeId:scope.homeId,root:scope.root,principalId:scope.principalId},reportId,observedAt:observedAt??null,recordedAt:new Date().toISOString(),summary,remoteWrites:false};
 const staged=join(folder,'.'+id+'.json');const path=join(folder,id+'.json');
 writeFileSync(staged,JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});renameSync(staged,path);return path;
}
