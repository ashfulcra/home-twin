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

test('explicit project intake audits only its own source folder and rejects sibling evidence',async()=>{
 const root='/Example_Residence/twin';
 /** @type {string[]} */
 const paths=[];
 const sourceHome={...home,sources:[{id:'own',path:root+'/sources/manual.md'},{id:'other',path:'/Other_Residence/twin/sources/manual.md'}]};
 const isolated=async (/** @type {string} */ p)=>{
  paths.push(p);
  if(p==='user/v1alpha1/info')return Response.json({userid:'owner'});
  if(p.includes('/baseline/download'))return Response.json(sourceHome);
  if(p.includes('/manual/download'))return new Response('Original manual');
  if(p.includes('file_upload?')){
   const folder=new URL('https://example.test/'+p).searchParams.get('path');
   if(folder===root)return Response.json({files:[{name:'home.json',id:'baseline'}]});
   if(folder===root+'/contributions')return Response.json({files:[]});
   if(folder===root+'/sources')return Response.json({files:[{name:'manual.md',id:'manual'}]});
  }
  throw Error('Unexpected cross-home read');
 };
 const result=await readMaintainerHome('example',root,isolated,{checkSources:true});
 expect(result.sourceChecks?.find(x=>x.id==='own').status).toBe('unverified');
 expect(result.sourceChecks?.find(x=>x.id==='other').status).toBe('out-of-scope');
 expect(paths.some(p=>decodeURIComponent(p).includes('Other_Residence'))).toBe(false);
 await expect(readMaintainerHome('wrong',root,isolated)).rejects.toThrow('match');
 await expect(readMaintainerHome('example',root,async p=>p==='user/v1alpha1/info'?Response.json({userid:'member'}):isolated(p))).rejects.toThrow('maintainer');
});
