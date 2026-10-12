import {test,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({principal:vi.fn(),resolve:vi.fn(),rpc:vi.fn()}));
vi.mock('$lib/server/join-access.js',()=>({joinPrincipal:m.principal}));
vi.mock('$lib/server/home-access.js',()=>({resolveHome:m.resolve}));
vi.mock('$lib/server/access-service.js',()=>({callAccessService:m.rpc}));
import {POST as join} from '../../routes/api/home/join/+server.js';
import {POST as admit} from '../../routes/api/home/admission/+server.js';
const target={homeId:'example',ownerUserId:'11111111-1111-4111-8111-111111111111'},user='22222222-2222-4222-8222-222222222222';
/** @param {any} [body] @param {boolean} [auth] @returns {any} */
const event=(body={},auth=true)=>({cookies:{get:()=>auth?'caller-current-token':null},request:new Request('https://example.test/',{method:'POST',body:JSON.stringify(body)})});
beforeEach(()=>{vi.clearAllMocks();m.principal.mockResolvedValue({deployment:target,userId:user});m.resolve.mockResolvedValue({deployment:target,userId:user,ownerUserId:target.ownerUserId,role:null,joining:true});m.rpc.mockResolvedValue({status:'pending-approval'});});
test('automatic request uses authenticated named home and current caller only',async()=>{const r=await join(event({homeId:'forged',ownerUserId:user}));expect(await r.json()).toEqual({status:'pending-approval'});expect(r.headers.get('cache-control')).toBe('private, no-store');expect(m.rpc).toHaveBeenCalledWith('caller-current-token',target.homeId,'request',undefined,target.ownerUserId);});
test('anonymous and already admitted callers cannot submit a new automatic request',async()=>{await expect(join(event({},false))).rejects.toMatchObject({status:401});m.resolve.mockResolvedValue({joining:false,role:'viewer'});expect((await(await join(event())).json()).status).toBe('already-admitted');expect(m.rpc).not.toHaveBeenCalled();});
test('owner admission relays only exact code with owner current token',async()=>{m.resolve.mockResolvedValue({deployment:target,userId:target.ownerUserId,ownerUserId:target.ownerUserId,role:'maintainer'});m.rpc.mockResolvedValue({status:'outgoing-confirmed-member-unverified'});const r=await admit(event({reviewCode:'33333333-3333-4333-8333-333333333333-'+'a'.repeat(64)}));expect((await r.json()).status).toBe('outgoing-confirmed-member-unverified');expect(m.rpc).toHaveBeenCalledWith('caller-current-token',target.homeId,'apply',expect.any(String),target.ownerUserId);});
test('anonymous or member cannot trigger approval; malformed code rejected before relay',async()=>{await expect(admit(event({},false))).rejects.toMatchObject({status:401});await expect(admit(event())).rejects.toMatchObject({status:403});m.resolve.mockResolvedValue({deployment:target,userId:target.ownerUserId,ownerUserId:target.ownerUserId,role:'maintainer'});await expect(admit(event({reviewCode:'../home.json'}))).rejects.toMatchObject({status:400});expect(m.rpc).not.toHaveBeenCalled();});
test('service failure is explicit pending operation, never access granted',async()=>{m.rpc.mockRejectedValue(Error('secret token internals'));await expect(join(event())).rejects.toMatchObject({status:503});try{await join(event());}catch(e){expect(JSON.stringify(e)).not.toContain('secret');}});

test('resume preview reveals the saved decision recipient to the owner only',async()=>{
 m.resolve.mockResolvedValue({deployment:target,userId:target.ownerUserId,ownerUserId:target.ownerUserId,role:'maintainer',root:'/Example/twin',endpoint:'https://example.test/'});
 // The resume API must reject a nonowner before reading any saved decision.
 m.resolve.mockResolvedValue({deployment:target,userId:user,ownerUserId:target.ownerUserId,role:'viewer'});
 const {GET}=await import('../../routes/api/home/admission/+server.js');
 await expect(GET({...event(),url:new URL('https://example.test/?reviewCode=33333333-3333-4333-8333-333333333333-'+'a'.repeat(64))})).rejects.toMatchObject({status:403});
});

test('confirmed pending requester receives only their own exact request context and optional approval-check prompt',async()=>{
 const deployment={...target,mode:'existing',name:'Example Home',sharedRoot:'/shared/home-twin/example'};m.principal.mockResolvedValue({deployment,userId:user});
 m.rpc.mockResolvedValue({status:'pending-approval',code:'example:'+user+':33333333-3333-4333-8333-333333333333:'+ 'a'.repeat(64)});
 const body=await(await join(event())).json();expect(body.agentStart.context).toMatchObject({userId:user,ownerUserId:target.ownerUserId,homeId:'example',requestId:'33333333-3333-4333-8333-333333333333'});expect(body.agentStart.context).not.toHaveProperty('role');expect(body.agentStart.requestStatus).toBe('sent');expect(body).not.toHaveProperty('home');
});
