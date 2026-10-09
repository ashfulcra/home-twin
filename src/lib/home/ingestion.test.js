import {test,expect} from 'vitest';
import {ingestHome} from './ingestion.js';
const owner='11111111-1111-4111-8111-111111111111', member='22222222-2222-4222-8222-222222222222';
const home={id:'example-home',ownerUserId:owner,revision:1,members:[{userId:member,role:'contributor'}]};
test('uses the authenticated account and source account, refuses impersonation, keeps unavailable folders explicit',async()=>{
 const result=await ingestHome(home,owner,async user=>user===owner?[{id:'n1',homeId:home.id,kind:'note',text:'Test note',authorUserId:member}]:Promise.reject(new Error('denied')));
 expect(result.rows[0].authorUserId).toBeNull();expect(result.unavailableMembers).toEqual([member]);
});
test('non-maintainer cannot run shared ingestion',async()=>{await expect(ingestHome(home,member,async()=>[])).rejects.toThrow('maintainer');});
test('one malformed row does not suppress valid member rows',async()=>{
 const result=await ingestHome(home,owner,async user=>user===owner?[]:[null,{id:'ok',authorUserId:member}]);
 expect(result.rows[1].authorUserId).toBe(member);expect(result.unavailableMembers).toEqual([]);
});
