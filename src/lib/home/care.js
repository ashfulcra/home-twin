/** Evidence lookup, not a general-purpose chat model.
 * @param {any} home @param {string} question */
export function answerHome(home,question){
 const q=question.toLowerCase();
 if(/plumb|electrician|roofer|contractor/.test(q)){
  const trade=q.includes('plumb')?'plumb':q.includes('electric')?'electric':q.includes('roof')?'roof':'contract';
  const matches=(home.contacts??[]).filter((/** @type {any} */ c)=>`${c.trade??''} ${c.name}`.toLowerCase().includes(trade));
  return matches.length?matches.map((/** @type {any} */ c)=>({text:`${c.name} · ${c.trade??'Provider'} · ${c.phone??c.email??'Contact details not recorded'}`,contactId:c.id,sourceIds:c.sourceIds??[]})):[{text:'That service provider is not recorded. Add a contact or a service invoice to establish who to call.'}];
 }
 const words=q.replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(word=>word.length>2&&!['when','was','the','last','maintained','maintenance','serviced','service','who','call','for','our','has','been'].includes(word));
 const items=(home.equipment??[]).filter((/** @type {any} */ e)=>words.some(word=>`${e.name} ${e.system} ${e.model??''}`.toLowerCase().includes(word)));
 if(!items.length)return [{text:'No matching equipment record yet. Add the equipment name or label; unknown service dates stay unknown.'}];
 return items.map((/** @type {any} */ e)=>({text:`${e.name}: last completed service ${e.lastService?.performedAt??'not recorded'}. Who to call: ${e.provider?.name??'not recorded'}${e.provider?.phone?' · '+e.provider.phone:''}.`,equipmentId:e.id,historyId:e.lastService?.id,sourceIds:[...(e.sourceIds??[]),...(e.lastService?.sourceIds??[])]}));
}
