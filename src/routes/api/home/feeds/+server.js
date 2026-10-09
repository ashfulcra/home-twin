import {error,json} from '@sveltejs/kit';
import {resolveHome} from '$lib/server/home-access.js';
import {readFulcraFile} from '$lib/server/fulcra-files.js';
import {FulcraAPI} from '$lib/api-client.js';
import {validateFeed,projectFeed,feedWindowSeconds} from '$lib/home/feeds.js';
export async function GET({cookies}){
 const token=cookies.get('fulcra_access_token');if(!token)throw error(401,'Sign in');
 try{const a=await resolveHome(token);const config=await readFulcraFile(a.endpoint,token,`${a.root}/feeds.json`,a.ownerUserId);if(!config)return json({feeds:[],status:'unconfigured'},{headers:{'Cache-Control':'private, no-store'}});
 const settings=JSON.parse(config.text);if(!Array.isArray(settings.feeds)||settings.feeds.length>20)throw error(422,'Invalid feed configuration');const api=new FulcraAPI(a.endpoint,token);const results=[];
 for(const setting of settings.feeds){
  try{const feed=validateFeed(setting);if(feed.equipmentId&&!(a.home.equipment??[]).some((/** @type {any} */ e)=>e.id===feed.equipmentId))throw new Error('Unknown equipment');const sourceUserId=feed.sourceUserId??a.ownerUserId;if(sourceUserId!==a.ownerUserId&&!(a.home.members??[]).some((/** @type {any} */ m)=>m.userId===sourceUserId&&m.role==='contributor'))throw new Error('Unregistered source account');
   const scope=`fulcra_userid=${encodeURIComponent(sourceUserId)}`;const catalog=await api.get(`user/v1alpha1/annotation?${scope}`);const source=catalog.find((/** @type {any} */ c)=>c.id===feed.dataType.split('/')[1]&&c.annotation_type==='moment'&&!c.deleted_at);if(!source)throw new Error('Configured source not in authorized catalog');
   const end=new Date(),start=new Date(end.getTime()-feedWindowSeconds(feed)*1000);const query=new URLSearchParams({start_time:start.toISOString(),end_time:end.toISOString(),fulcra_userid:sourceUserId});
   const records=await api.get(`data/v1alpha1/event/${feed.dataType}?${query}`);if(!Array.isArray(records))throw new Error('Unsupported record response');
   results.push({...projectFeed({...feed,homeId:a.home.id},records,new Date().toISOString()),sourceName:source.name});
  }catch{results.push({id:typeof setting?.id==='string'?setting.id:'invalid-feed',name:typeof setting?.name==='string'?setting.name:'Configured feed',state:'unavailable',latest:null,syncedAt:new Date().toISOString(),detail:'Source access, format or connection unavailable; no live state inferred.'});}
 }
 return json({feeds:results,status:'configured'},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){if(e&&typeof e==='object'&&'status'in e)throw e;throw error(502,'Feeds unavailable; saved home records unchanged');}
}
