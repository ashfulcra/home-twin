import {projectHome} from './projection.js';
/** Read-only bounded lookup over the current authorized home projection.
 * @param {any} home @param {string} query @returns {any[]}
 */
export function searchHomeKnowledge(home,query){
 const terms=String(query??'').trim().slice(0,120).toLowerCase().split(/\s+/).filter(Boolean);
 if(!terms.length||!home)return [];
 const asOf=Number.isFinite(Date.parse(home.asOf))?home.asOf:new Date().toISOString();
 const view=projectHome(home,asOf);
 /** @param {any} record */
 const sources=record=>(record.sourceIds??[]).flatMap((/** @type {string} */ id)=>{const s=view.sources.find((/** @type {any} */ x)=>x.id===id);return s?[{id:s.id,title:s.title??'Original record'}]:[];});
 /** @param {any} id */
 const unit=id=>view.equipment.find((/** @type {any} */ e)=>e.id===id);
 /** @param {any} item */
 const unitWords=item=>item?[item.name,item.system,item.manufacturer,item.model,item.room?.name,(item.facts??[]).map((/** @type {any} */ f)=>`${f.name??''} ${f.value??''}`).join(' ')].filter(Boolean).join(' '):'';
 /** @type {any[]} */ const records=[];
 for(const item of view.equipment)records.push({kind:'equipment',id:item.id,entityId:item.id,title:item.name,detail:[item.system,item.manufacturer,item.model,item.room?.name].filter(Boolean).join(' · '),lastServiceAt:item.lastService?.performedAt??null,providerName:item.provider?.name??null,sources:sources(item),words:unitWords(item)+' '+(item.provider?.name??'')});
 for(const c of view.contacts??[])records.push({kind:'provider',id:c.id,title:c.name,detail:c.trade??c.specialty??c.role??'',phone:c.phone??null,email:c.email??null,sources:sources(c),words:[c.name,c.trade,c.specialty,c.role,c.phone,c.email,...view.equipment.filter((/** @type {any} */ e)=>e.provider?.id===c.id).map(unitWords)].filter(Boolean).join(' ')});
 for(const h of view.history)records.push({kind:'history',id:h.id,entityId:h.equipmentId??null,title:h.title??h.summary??'Service record',detail:h.summary??'',performedAt:h.performedAt??null,status:h.status??'Not recorded',sources:sources(h),words:[h.title,h.summary,h.kind,h.status,h.performedAt,unitWords(unit(h.equipmentId))].filter(Boolean).join(' ')});
 for(const s of view.schedules)records.push({kind:'schedule',id:s.id,entityId:s.equipmentId??null,title:s.name,detail:s.description??'',dueAt:s.dueAt??null,status:s.state,sources:sources(s),words:[s.name,s.description,s.kind,s.state,unitWords(unit(s.equipmentId))].filter(Boolean).join(' ')});
 return records.filter(r=>terms.every(t=>r.words.toLowerCase().includes(t))).slice(0,40).map(({words,...record})=>record);
}
