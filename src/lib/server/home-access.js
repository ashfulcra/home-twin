import {env as publicEnv} from '$env/dynamic/public';
import {env} from '$env/dynamic/private';
import {error} from '@sveltejs/kit';
import {FulcraAPI} from '$lib/api-client.js';
import {readFulcraFile} from './fulcra-files.js';
import {validateConnection,homeRole} from '$lib/home/access.js';
import {existingHomeDeployment} from '$lib/home/deployment.js';
/** Every request resolves current permissions through Fulcra; no owner token
 * or cached private snapshot is used for another account.
 * @param {string} token @param {{allowJoining?:boolean}} [options] */
export async function resolveHome(token,options={}) {
 const endpoint=publicEnv.PUBLIC_FULCRA_API_ENDPOINT;
 const api=new FulcraAPI(endpoint,token);const principal=await api.get('user/v1alpha1/info');
 const localRoot=env.HOME_ROOT||'/home/twin';
 const deployment=existingHomeDeployment({...publicEnv,...env});
 if(deployment){
  const own=principal.userid===deployment.ownerUserId;
  const root=own?localRoot:deployment.sharedRoot;
  const base={endpoint,userId:principal.userid,root,ownerUserId:deployment.ownerUserId,deployment};
  function join(){if(!options.allowJoining)throw error(403,'Ask this home’s owner to approve and share access.');return {...base,joining:true,role:null,file:null,home:null};}
  let file;
  try{file=await readFulcraFile(endpoint,token,`${root}/home.json`,own?undefined:deployment.ownerUserId);}
  catch(err){if(!own&&((err instanceof Error&&/status 403|failed: 403/.test(err.message))||(err&&typeof err==='object'&&'status' in err&&err.status===403)))return join();throw err;}
  const home=file?JSON.parse(file.text):null;
  const role=home&&home.id===deployment.homeId&&home.ownerUserId===deployment.ownerUserId?homeRole(home,principal.userid):null;
  if(!file||!role){if(own)throw error(file?409:502,'The configured home record needs owner attention. Saved records are unchanged.');return join();}
  return {...base,joining:false,role,file,home};
 }
 const link=await readFulcraFile(endpoint,token,`${localRoot}/connection.json`);
 if(!link||JSON.parse(link.text).mode==='own'){const file=await readFulcraFile(endpoint,token,`${localRoot}/home.json`);return {joining:false,deployment:null,endpoint,userId:principal.userid,root:localRoot,ownerUserId:principal.userid,role:'maintainer',file,home:file?JSON.parse(file.text):null};}
 const connection=validateConnection(JSON.parse(link.text));
 const file=await readFulcraFile(endpoint,token,`${connection.root}/home.json`,connection.ownerUserId);
 if(!file)throw error(403,'Shared home access is unavailable or revoked');
 const home=JSON.parse(file.text);const role=homeRole(home,principal.userid);
 if(home.id!==connection.homeId||home.ownerUserId!==connection.ownerUserId||!role)throw error(403,'You are not a member of this home');
 return {joining:false,deployment:null,endpoint,userId:principal.userid,...connection,role,file,home};
}
