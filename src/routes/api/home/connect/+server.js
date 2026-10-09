import {env as publicEnv} from '$env/dynamic/public';
import {env} from '$env/dynamic/private';
import {error,json} from '@sveltejs/kit';
import {FulcraAPI} from '$lib/api-client.js';
import {readFulcraFile,writeFulcraJSON} from '$lib/server/fulcra-files.js';
import {validateConnection,homeRole} from '$lib/home/access.js';
export async function POST({cookies,request}) {
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in first');
 let connection;try{const text=await request.text();if(text.length>2000)throw new Error('Connection too long');const input=JSON.parse(text);connection=input.mode==='own'?{mode:'own'}:validateConnection(input);}catch{throw error(400,'Enter valid maintainer and home IDs');}
 const endpoint=publicEnv.PUBLIC_FULCRA_API_ENDPOINT;const api=new FulcraAPI(endpoint,token);
 const principal=await api.get('user/v1alpha1/info');
 if('mode' in connection){await writeFulcraJSON(endpoint,token,`${env.HOME_ROOT||'/home/twin'}/connection.json`,connection);return json({status:'connected'});}
 const file=await readFulcraFile(endpoint,token,`${connection.root}/home.json`,connection.ownerUserId);
 const home=file?JSON.parse(file.text):null;
 if(!home||home.id!==connection.homeId||home.ownerUserId!==connection.ownerUserId||!homeRole(home,principal.userid))throw error(403,'Ask the maintainer to share this home and add your account as a member');
 await writeFulcraJSON(endpoint,token,`${env.HOME_ROOT||'/home/twin'}/connection.json`,connection);
 return json({status:'connected'});
}
