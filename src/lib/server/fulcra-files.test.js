import {test,expect,vi,afterEach} from 'vitest';
vi.mock('$lib/api-client.js',()=>({FulcraAPI:class{async get(){return {files:[{id:'bad',name:'bad.json'},{id:'good',name:'good.json'}]};}}}));
import {listFulcraJSON} from './fulcra-files.js';
afterEach(()=>vi.unstubAllGlobals());
test('malformed JSON remains a review row without suppressing valid files',async()=>{
 vi.stubGlobal('fetch',vi.fn(async url=>new Response(url.includes('/bad/')?'not-json':JSON.stringify({id:'good',kind:'note',text:'Preserved'}))));
 const rows=await listFulcraJSON('https://example.test/','test-token','/contributions');
 expect(rows).toEqual([null,{id:'good',kind:'note',text:'Preserved'}]);
});
