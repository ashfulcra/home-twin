import {test,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({read:vi.fn(),write:vi.fn()}));
vi.mock('$env/dynamic/public',()=>({env:{PUBLIC_FULCRA_API_ENDPOINT:'https://example.test/'}}));
vi.mock('$env/dynamic/private',()=>({env:{}}));
vi.mock('$lib/api-client.js',()=>({FulcraAPI:class{async get(){return {userid:'test-owner'};}}}));
vi.mock('$lib/server/fulcra-files.js',()=>({readFulcraFile:mocks.read,writeFulcraJSON:mocks.write}));
import {POST} from './+server.js';
const cookies={get:()=> 'test-token',getAll:()=>[],set:()=>{},delete:()=>{},serialize:()=>''};
/** Only the route's consumed fields are supplied by this test. @returns {any} */
function event(){return {cookies,request:new Request('https://example.test/api/home/connect',{method:'POST',body:JSON.stringify({mode:'own'})})};}
beforeEach(()=>vi.clearAllMocks());
test('connection reports pending when readback still has previous target',async()=>{
 mocks.read.mockResolvedValue({text:JSON.stringify({homeId:'old'})});
 const response=await POST(event());
 expect(response.status).toBe(202);expect(await response.json()).toEqual({status:'pending-readback'});
});
test('connection reports connected only after exact intended target reads back',async()=>{
 mocks.read.mockResolvedValue({text:JSON.stringify({mode:'own'})});
 const response=await POST(event());
 expect(response.status).toBe(200);expect(await response.json()).toEqual({status:'connected'});
});
