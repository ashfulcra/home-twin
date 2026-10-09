import {env as publicEnv} from '$env/dynamic/public';
import {env} from '$env/dynamic/private';
import {error} from '@sveltejs/kit';
import {FulcraAPI} from '$lib/api-client.js';
import {readFulcraFile} from './fulcra-files.js';
import {validateConnection,homeRole} from '$lib/home/access.js';
/** Every request resolves current permissions through Fulcra; no owner token
 * or cached private snapshot is used for another account.
 * @param {string} token */
export async function resolveHome(token) {
 const endpoint=publicEnv.PUBLIC_FULCRA_API_ENDPOINT;
 const api=new FulcraAPI(endpoint,token);const principal=await api.get('user/v1alpha1/info');
 const localRoot=env.HOME_ROOT||'/home/twin';
 const link=await readFulcraFile(endpoint,token,`${localRoot}/connection.json`);
 if(!link){const file=await readFulcraFile(endpoint,token,`${localRoot}/home.json`);return {endpoint,userId:principal.userid,root:localRoot,ownerUserId:principal.userid,role:'maintainer',file,home:file?JSON.parse(file.text):null};}
 const connection=validateConnection(JSON.parse(link.text));
 const file=await readFulcraFile(endpoint,token,`${connection.root}/home.json`,connection.ownerUserId);
 if(!file)throw error(403,'Shared home access is unavailable or revoked');
 const home=JSON.parse(file.text);const role=homeRole(home,principal.userid);
 if(home.id!==connection.homeId||home.ownerUserId!==connection.ownerUserId||!role)throw error(403,'You are not a member of this home');
 return {endpoint,userId:principal.userid,...connection,role,file,home};
}
