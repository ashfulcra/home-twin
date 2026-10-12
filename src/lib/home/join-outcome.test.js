import {test,expect} from 'vitest';
import {readJoinOutcome} from '../../../scripts/join-outcome.mjs';
const owner='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',request='33333333-3333-4333-8333-333333333333',review='44444444-4444-4444-8444-444444444444',sha='a'.repeat(64),target={homeId:'example',ownerUserId:owner};
const path='/shared/home-twin/example/join-status/'+request+'-'+review+'-'+sha+'.json';
const grant={grant_type:'user',sharing_fulcra_userid:owner,group_id:null,share_all_data:false,time_start:null,time_end:null,fulcra_data_types:['file:'+path]};
test('applicant reads an exact owner-shared rejection without owner credential or home records',async()=>{
 const c={incoming:async()=>[grant],file:async()=>({text:JSON.stringify({schema:'home-twin-join-outcome/1',homeId:'example',ownerUserId:owner,recipientUserId:user,requestId:request,reviewId:review,decision:'reject',role:null})})};
 expect(await readJoinOutcome(c,target,user,request)).toBe('request-rejected');
});
test('no outcome is pending, but inaccessible addressed outcomes are failures',async()=>{
 expect(await readJoinOutcome({incoming:async()=>[]},target,user,request)).toBe('pending-approval');
 await expect(readJoinOutcome({incoming:async()=>[grant],file:async()=>null},target,user,request)).rejects.toThrow(/unavailable/);
});
test('foreign sender cannot invent an approval; wrong request or recipient is held',async()=>{
 expect(await readJoinOutcome({incoming:async()=>[{...grant,sharing_fulcra_userid:user}]},target,user,request)).toBe('pending-approval');
 const c={incoming:async()=>[grant],file:async()=>({text:JSON.stringify({schema:'home-twin-join-outcome/1',homeId:'example',ownerUserId:owner,recipientUserId:owner,requestId:request,reviewId:review,decision:'approve',role:'viewer'})})};
 await expect(readJoinOutcome(c,target,user,request)).rejects.toThrow(/scope/);
});
