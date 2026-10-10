import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test,expect} from 'vitest';
import {mkdtempSync,readFileSync,readdirSync,writeFileSync,chmodSync,mkdirSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {buildMaintainerCycle} from './maintainer-cycle.js';
import {assertExternalState,persistCycle} from '../../../scripts/maintainer-journal.mjs';
const input={home:{schemaVersion:1,id:'example',name:'Example',revision:1,ownerUserId:'owner',equipment:[],rooms:[],sources:[]},principalId:'owner',root:'/shared/home-twin/example',baselineVersion:'v1',rows:[],receipts:[],unavailableMembers:[]};
const folder=()=>{const p=mkdtempSync(join(tmpdir(),'home-cycle-'));chmodSync(p,0o700);return p;};
test('private repeated cycles stay quiet and preserve one report; changed input retains both',()=>{
 const p=folder();const a=buildMaintainerCycle(input);expect(persistCycle(p,a).changed).toBe(true);expect(persistCycle(p,buildMaintainerCycle({...input,ingestedAt:'2026-01-02'})).changed).toBe(false);
 expect(readdirSync(join(p,'reports'))).toHaveLength(1);expect(persistCycle(p,buildMaintainerCycle({...input,baselineVersion:'v2'})).changed).toBe(true);expect(readdirSync(join(p,'reports'))).toHaveLength(2);
 const checkpoint=JSON.parse(readFileSync(join(p,'checkpoint.json'),'utf8'));expect(checkpoint.homeId).toBe('example');expect(checkpoint.lastCycleId).not.toBe(a.cycleId);
});
test('report saved before interrupted checkpoint is recovered without rewriting it',()=>{
 const p=folder();const a=buildMaintainerCycle(input);persistCycle(p,a);writeFileSync(join(p,'checkpoint.json'),JSON.stringify({schema:'home-twin-checkpoint/1',principalId:'owner',homeId:'example',root:input.root,lastCycleId:null}),{mode:0o600});
 const before=readFileSync(join(p,'reports',a.cycleId+'.json'));const recovery=persistCycle(p,a);expect(recovery.recovered).toBe(true);expect(readFileSync(join(p,'reports',a.cycleId+'.json'))).toEqual(before);
});
test('wrong identity, broad permissions, occupied lock and tampered report reject safely',()=>{
 const p=folder();const a=buildMaintainerCycle(input);persistCycle(p,a);expect(()=>persistCycle(p,buildMaintainerCycle({...input,principalId:'other',home:{...input.home,ownerUserId:'other'}}))).toThrow('scope');
 chmodSync(p,0o755);expect(()=>persistCycle(p,a)).toThrow('private');chmodSync(p,0o700);mkdirSync(join(p,'.cycle.lock'));expect(()=>persistCycle(p,a)).toThrow('lock');
 const other=folder();persistCycle(other,a);writeFileSync(join(other,'reports',a.cycleId+'.json'),JSON.stringify({...a,material:{...a.material,baselineVersion:'forged'}}));expect(()=>persistCycle(other,a)).toThrow('integrity');
});

test('private state rejects repository descendants including dot-dot-prefixed names',()=>{ const repo=folder();const child=join(repo,'..private');mkdirSync(child);expect(()=>assertExternalState(child,repo)).toThrow('outside');expect(()=>assertExternalState(repo,repo)).toThrow('outside');expect(()=>assertExternalState(folder(),repo)).not.toThrow();});

test('actual process crash preserves report and blocks takeover until abandoned lock is inspected',()=>{
 const p=folder();const c=buildMaintainerCycle(input);const modulePath=fileURLToPath(new URL('../../../scripts/maintainer-journal.mjs',import.meta.url));
 const script=`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const original=fs.renameSync;fs.renameSync=(a,b)=>{if(b.endsWith('checkpoint.json'))process.kill(process.pid,'SIGKILL');return original(a,b);};syncBuiltinESMExports();const {persistCycle}=await import(${JSON.stringify(modulePath)});persistCycle(${JSON.stringify(p)},${JSON.stringify(c)});`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',script]);expect(child.signal).toBe('SIGKILL');expect(()=>persistCycle(p,c)).toThrow('lock');
 const report=JSON.parse(readFileSync(join(p,'reports',c.cycleId+'.json'),'utf8'));expect(report.cycleId).toBe(c.cycleId);rmdirSync(join(p,'.cycle.lock'));expect(persistCycle(p,c).recovered).toBe(true);expect(readdirSync(join(p,'reports'))).toEqual([c.cycleId+'.json']);
});
