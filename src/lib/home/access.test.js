import {it,expect} from 'vitest';
import {validateConnection,homeRole,attributeSharedRows} from './access.js';
const owner='12345678-1234-4123-8123-123456789abc';
it('rejects path traversal and derives only home-scoped roots',()=>{
 expect(()=>validateConnection({ownerUserId:owner,homeId:'../private'})).toThrow();
 expect(validateConnection({ownerUserId:owner,homeId:'example',root:'/private'}).root).toBe('/shared/home-twin/example');
});
it('viewer and contributor roles come only from owner membership',()=>{
 const home={ownerUserId:owner,members:[{userId:'member',role:'contributor'}]};
 expect(homeRole(home,'member')).toBe('contributor');expect(homeRole(home,'unrelated')).toBeNull();expect(homeRole(home,owner)).toBe('maintainer');
});
it('shared evidence cannot impersonate a different source account',()=>{
 const rows=attributeSharedRows([{id:'a',authorUserId:owner},{id:'b',authorUserId:'member'}],'member');
 expect(rows[0].authorUserId).toBeNull();expect(rows[1].authorUserId).toBe('member');
});
