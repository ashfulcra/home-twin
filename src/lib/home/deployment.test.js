import {test,expect} from 'vitest';
import {existingHomeDeployment} from './deployment.js';
const owner='11111111-1111-4111-8111-111111111111';
test('generic starter remains generic without a named target',()=>expect(existingHomeDeployment({})).toBeNull());
test('named deployment derives one exact shared root',()=>expect(existingHomeDeployment({HOME_MODE:'existing',HOME_ID:'example-home',HOME_OWNER_USER_ID:owner,PUBLIC_APP_NAME:'Example Home'})).toEqual({mode:'existing',homeId:'example-home',ownerUserId:owner,name:'Example Home',sharedRoot:'/shared/home-twin/example-home'}));
test.each([{HOME_MODE:''},{HOME_ID:''},{HOME_MODE:false},{HOME_MODE:0},{HOME_MODE:null},{HOME_MODE:'existing'},{HOME_ID:'example-home'},{HOME_MODE:'unknown'},{HOME_MODE:'existing',HOME_ID:'../other',HOME_OWNER_USER_ID:owner},{HOME_MODE:'existing',HOME_ID:'example-home',HOME_OWNER_USER_ID:'bad'}])('partial or malformed target fails closed: %j',(env)=>expect(()=>existingHomeDeployment(env)).toThrow());
