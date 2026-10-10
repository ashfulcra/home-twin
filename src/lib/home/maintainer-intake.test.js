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
