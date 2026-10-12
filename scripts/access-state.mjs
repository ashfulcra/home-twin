import {mkdirSync,lstatSync,readFileSync,writeFileSync,renameSync,openSync,fsyncSync,closeSync,rmdirSync} from 'node:fs';
import {join,dirname} from 'node:path';import {createHash,randomUUID} from 'node:crypto';
/** @param {any} value */
export const accessDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** @param {string} path */
export function privateDirectory(path){mkdirSync(path,{recursive:true,mode:0o700});const st=lstatSync(path);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077))throw Error('Private non-symlink access state required');}
/** @param {string} path @returns {any} */
export function readAccessState(path){try{const st=lstatSync(path);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)||st.size>3*1024*1024)throw Error('Private bounded access record required');const value=JSON.parse(readFileSync(path,'utf8'));const {integrity,...body}=value;if(accessDigest(body)!==integrity)throw Error('Access journal integrity differs; preserve and inspect');return body;}catch(e){if(e&&typeof e==='object'&&'code' in e&&e.code==='ENOENT')return null;throw e;}}
/** @param {string} path @param {any} body */
export function saveAccessState(path,body){privateDirectory(dirname(path));const temp=join(dirname(path),'.access-'+randomUUID()+'.json');writeFileSync(temp,JSON.stringify({...body,integrity:accessDigest(body)}),{flag:'wx',mode:0o600});const fd=openSync(temp,'r');try{fsyncSync(fd);}finally{closeSync(fd);}renameSync(temp,path);const parent=openSync(dirname(path),'r');try{fsyncSync(parent);}finally{closeSync(parent);}}
/** @template T @param {string} directory @param {()=>Promise<T>} action */
export async function accessLock(directory,action){privateDirectory(directory);const lock=join(directory,'.cycle.lock');try{mkdirSync(lock,{mode:0o700});}catch{throw Error('Access or maintainer lock occupied; retry after the current operation. Never steal a live lock.');}try{return await action();}finally{rmdirSync(lock);}}
