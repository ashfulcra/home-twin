import {test,expect,vi,beforeEach,afterEach} from 'vitest';
import {createHash} from 'node:crypto';
const mocks=vi.hoisted(()=>({access:vi.fn(),rows:vi.fn(),listing:vi.fn()}));
vi.mock('$lib/server/home-access.js',()=>({resolveHome:mocks.access}));
vi.mock('$lib/server/home-contributions.js',()=>({readHomeContributions:mocks.rows}));
vi.mock('$lib/api-client.js',()=>({FulcraAPI:class{
 /** @param {string} endpoint @param {string} token */
 constructor(endpoint,token){this.token=token;}
 /** @param {string} path */
 async get(path){return mocks.listing(path,this.token);}
}}));
import {GET} from './+server.js';
const bytes=new TextEncoder().encode('Synthetic café\r\noriginal\n');
const sha=(/** @type {Uint8Array} */ value)=>createHash('sha256').update(value).digest('hex');
/** @type {any} */ let access;
/** @type {any} */ let source;
/** @type {any} */ let download;
/** @param {string|undefined} [token] @returns {any} */
function event(token='caller-token'){return {cookies:{get:()=>token},url:new URL('https://example.test/api/home/source?id=manual')};}
beforeEach(()=>{
 vi.clearAllMocks();
 source={id:'manual',path:'/example/twin/sources/manual.md',sha256:sha(bytes)};
 access={file:{id:'home'},endpoint:'https://api.example.test/',root:'/example/twin',ownerUserId:'owner',userId:'owner',home:{id:'example',revision:1,sources:[source],equipment:[],members:[]}};
 mocks.access.mockImplementation(async()=>access);mocks.rows.mockResolvedValue({rows:[]});
 mocks.listing.mockResolvedValue({files:[{id:'original',name:'manual.md'}]});
 download=vi.fn(async()=>new Response(bytes));vi.stubGlobal('fetch',download);
});
afterEach(()=>vi.unstubAllGlobals());
test('changed legacy original is rejected before any content response',async()=>{
 download.mockResolvedValue(new Response('Revised original'));
 await expect(GET(event())).rejects.toMatchObject({status:409});
 expect(source.sha256).toBe(sha(bytes));
});
test('matching legacy original returns exact bytes including BOM and non-UTF8 bytes',async()=>{
 const raw=new Uint8Array([239,187,191,...bytes,255]);source.sha256=sha(raw).toUpperCase();download.mockResolvedValue(new Response(raw));
 const response=await GET(event());
 expect(new Uint8Array(await response.arrayBuffer())).toEqual(raw);
 expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
 expect(response.headers.get('cache-control')).toBe('private, no-store');
 expect(response.headers.get('x-content-type-options')).toBe('nosniff');
 expect(download.mock.calls[0][1].headers.Authorization).toBe('Bearer caller-token');
});
test('checksumless legacy references remain available without inventing verification',async()=>{
 delete source.sha256;const response=await GET(event());
 expect(response.status).toBe(200);expect(await response.text()).toBe(new TextDecoder().decode(bytes));expect(source.sha256).toBeUndefined();
});
test('invalid recorded checksum requires review instead of returning original bytes',async()=>{
 source.sha256='invalid';await expect(GET(event())).rejects.toMatchObject({status:409});
});
test('an unauthenticated caller never resolves or downloads home sources',async()=>{
 await expect(GET({...event(),cookies:{...event().cookies,get:()=>undefined}})).rejects.toMatchObject({status:401});expect(mocks.access).not.toHaveBeenCalled();expect(download).not.toHaveBeenCalled();
});
test('a member cannot read a legacy reference outside the shared source folder',async()=>{
 access.userId='member';source.path='/private/manual.md';await expect(GET(event())).rejects.toMatchObject({status:403});expect(download).not.toHaveBeenCalled();
});
test('a currently authorized member reads the shared original with their own token',async()=>{
 access.userId='member';const response=await GET(event('member-token'));expect(response.status).toBe(200);expect(mocks.listing).toHaveBeenCalledWith(expect.stringContaining('fulcra_userid=owner'),'member-token');expect(download.mock.calls[0][1].headers.Authorization).toBe('Bearer member-token');
});
test('missing original is unavailable rather than a successful empty response',async()=>{
 mocks.listing.mockResolvedValue({files:[]});await expect(GET(event())).rejects.toMatchObject({status:404});expect(download).not.toHaveBeenCalled();
});
/** @param {string} [author] */
function attachment(author='owner'){
 source.attachment={sha256:sha(bytes),sizeBytes:bytes.length,mimeType:'text/plain',extension:'txt',originalName:'synthetic.txt'};
 source.contributionId='11111111-1111-4111-8111-111111111111';source.sourceUserId=author;
 mocks.listing.mockResolvedValue({files:[{id:'original',name:source.contributionId+'-'+source.attachment.sha256+'.txt'}]});
}
test('matching attachment keeps its download behavior and byte checks',async()=>{
 attachment();const response=await GET(event());expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);expect(response.headers.get('content-disposition')).toContain('attachment; filename=');
});
test('a changed attachment is still rejected',async()=>{
 attachment();download.mockResolvedValue(new Response(new Uint8Array(bytes.length)));await expect(GET(event())).rejects.toMatchObject({status:409});
});
test('a revoked source contributor is never accessed',async()=>{
 attachment('revoked');await expect(GET(event())).rejects.toMatchObject({status:403});expect(download).not.toHaveBeenCalled();
});

test('an owner root-level legacy source retains the root-folder lookup',async()=>{
 source.path='/manual.md';
 mocks.listing.mockImplementation(async path=>new URL(path,'https://api.example.test/').searchParams.get('path')==='/'?{files:[{id:'original',name:'manual.md'}]}:{files:[]});
 const response=await GET(event());expect(response.status).toBe(200);expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
});
