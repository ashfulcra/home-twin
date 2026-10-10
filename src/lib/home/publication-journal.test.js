import {test,expect} from 'vitest';import {mkdtempSync,chmodSync,readdirSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {runPublication} from '../../../scripts/publication-journal.mjs';
const input={home:{schemaVersion:1,id:'example',revision:1,ownerUserId:'owner',equipment:[]},principalId:'owner',root:'/shared/home-twin/example',baselineVersion:'v1',rows:[{id:'n',homeId:'example',kind:'note',text:'Checked',authorUserId:'owner'}],unavailableMembers:[]};
test('failed upload retains immutable intent; next run resolves remote success without duplicate publication',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'home-publish-'));chmodSync(dir,0o700);let current=structuredClone(input);const files=new Map();let writes=0;let unavailable=false;
 const t={read:async()=>{if(unavailable)throw Error('Network unavailable');return current;},readSnapshot:async (/** @type {string} */ path)=>files.get(path)??null,write:async(/** @type {string} */ path,/** @type {any} */ value)=>{files.set(path,value);if(path.endsWith('/home.json')){writes++;current={...input,home:value,baselineVersion:'v2'};unavailable=true;throw Error('Lost response');}}};
 await expect(runPublication(dir,t)).rejects.toThrow('Network');expect(writes).toBe(1);const intent=JSON.parse(readFileSync(join(dir,'publication.json'),'utf8'));expect(intent.status).toBe('pending');unavailable=false;
 expect((await runPublication(dir,t))?.reused).toBe(true);expect(writes).toBe(1);expect(readdirSync(join(dir,'publications'))).toHaveLength(1);expect(await runPublication(dir,t)).toBeNull();
});
