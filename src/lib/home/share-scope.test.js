import {test,expect} from 'vitest';
import {exactAdmissionShare} from './share-scope.js';
const owner='11111111-1111-4111-8111-111111111111',member='22222222-2222-4222-8222-222222222222';
const body={datashare_name:'home-twin-request:example:request',fulcra_user_name:owner,time_start:null,time_end:null,fulcra_data_types:['file:/shared/home-twin/example/join-requests/request.json'],share_all_data:false,permissions:[{allowed_fulcra_userid:member}],group_permissions:[]};
const receipt={datashare_id:'33333333-3333-4333-8333-333333333333',datashare_name:'home-twin-request:example:request',sharing_fulcra_userid:owner,sharing_fulcra_user_name:'A display name',sharing_fulcra_user_picture:null,time_start:null,time_end:null,fulcra_data_types:['file:/shared/home-twin/example/join-requests/request.json'],share_all_data:false,created_at:'2026-10-12T17:00:00Z',permissions:[{allowed_fulcra_userid:member}],group_permissions:[]};
test('uses outgoing authenticated sharing account ID rather than an API request field or display name',()=>{expect(exactAdmissionShare([receipt],body)).toBe('33333333-3333-4333-8333-333333333333');});
test.each([{sharing_fulcra_userid:member,fulcra_user_name:owner},{sharing_fulcra_userid:undefined,fulcra_user_name:owner},{permissions:[{allowed_fulcra_userid:owner}]},{fulcra_data_types:['file:/shared/home-twin/example/']},{group_permissions:[{allowed_group_id:member}]},{share_all_data:true}])('actual outgoing shape does not weaken identity or exact scope: %j',patch=>{expect(()=>exactAdmissionShare([{...receipt,...patch}],body)).toThrow(/scope|recipient/);});
test('an unrelated native group receipt does not replace the exact named user receipt',()=>{
 const group={...receipt,datashare_id:'44444444-4444-4444-8444-444444444444',datashare_name:'other-group-file',permissions:[],group_permissions:[{allowed_group_id:'example-group'}],fulcra_data_types:['file:/shared/example-group/note.json']};
 expect(exactAdmissionShare([group,receipt],body)).toBe(receipt.datashare_id);
});
test('a connector summary cannot stand in for a complete native outgoing receipt',()=>{
 const summary={datashare_id:receipt.datashare_id,datashare_name:receipt.datashare_name,sharing_fulcra_userid:owner,share_all_data:false,file_paths:['/shared/home-twin/example/join-requests/request.json'],with_user_ids:[member]};
 expect(()=>exactAdmissionShare([summary],body)).toThrow(/scope|recipient/);
});
