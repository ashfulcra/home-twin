import {test,expect} from 'vitest';
import {readMaintainerHome} from '../../../scripts/fulcra-ingest.mjs';
const home={schemaVersion:1,id:'example',name:'Example',revision:1,ownerUserId:'owner',equipment:[],members:[]};
const get=async (/** @type {string} */ path)=>{
 if(path==='user/v1alpha1/info')return Response.json({userid:'owner'});
 if(path.includes('file_upload?'))return Response.json({files:path.includes(encodeURIComponent('/home/twin'))&&!path.includes('contributions')?[{name:'home.json',id:'baseline'}]:[]});
 if(path.includes('/baseline/download'))return Response.json(home);
 throw Error('Unexpected API path');
};
test('explicit legacy root reads current baseline and identity without unrelated vault paths',async()=>{
 const result=await readMaintainerHome('example','/home/twin',get);expect(result.principalId).toBe('owner');expect(result.root).toBe('/home/twin');expect(result.baselineVersion).toBe('baseline');expect(result.home.id).toBe('example');expect(result.rows).toEqual([]);
});
test('arbitrary roots, mismatched home IDs and contributor principals cannot drive maintainer intake',async()=>{
 await expect(readMaintainerHome('example','/home/secrets',get)).rejects.toThrow('root');
 await expect(readMaintainerHome('wrong','/home/twin',get)).rejects.toThrow('match');
 await expect(readMaintainerHome('example','/home/twin',async p=>p==='user/v1alpha1/info'?Response.json({userid:'member'}):get(p))).rejects.toThrow('maintainer');
});

test('baseline changed during contributor reads cannot be returned as coherent intake',async()=>{
 let changed=false;const drifting=async (/** @type {string} */ p)=>{if(p.includes('contributions')){changed=true;return Response.json({files:[]});}if(p.includes('/baseline/download')&&changed)return Response.json({...home,revision:9});return get(p);};await expect(readMaintainerHome('example','/home/twin',drifting)).rejects.toThrow('changed');
});
test('optional source audit completes before the final baseline coherence check',async()=>{
 let changed=false;const sourceHome={...home,sources:[{id:'manual',path:'/home/manual.md'}]};
 const original=async (/** @type {string} */ p)=>{if(p.includes('/original/download')){changed=true;return new Response('new original');}if(p.includes(encodeURIComponent('/home'))&&!p.includes(encodeURIComponent('/home/twin')))return Response.json({files:[{name:'manual.md',id:'original'}]});if(p.includes('/baseline/download'))return Response.json({...sourceHome,...(changed?{revision:2}:{})});return get(p);};
 await expect(readMaintainerHome('example','/home/twin',original,{checkSources:true})).rejects.toThrow('changed');
});
