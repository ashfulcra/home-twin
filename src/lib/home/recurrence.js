/** Calendar dates are home-local labels, never instants. @param {any} value */
export function isCalendarDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number(value.slice(0,4))<100)return false;
 const d=new Date(value+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===value;
}
/** @param {any} recurrence @param {any} dueAt */
export function validRecurrence(recurrence,dueAt){return !!recurrence&&typeof recurrence==='object'&&!Array.isArray(recurrence)&&Number.isSafeInteger(recurrence.every)&&recurrence.every>=1&&recurrence.every<=365&&['days','weeks','months'].includes(recurrence.unit)&&isCalendarDate(dueAt);}
/** Each occurrence uses the original anchor, avoiding February-induced drift.
 * @param {any} schedule @param {number} index */
export function occurrenceAt(schedule,index){
 if(!validRecurrence(schedule.recurrence,schedule.dueAt)||!Number.isSafeInteger(index)||index<0)return null;
 const [year,month,day]=schedule.dueAt.split('-').map(Number);const r=schedule.recurrence;
 let d;
 if(r.unit==='months'){
  const target=month-1+index*r.every;const y=year+Math.floor(target/12),m=target%12;
  const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();d=new Date(Date.UTC(y,m,Math.min(day,last),12));
 }else{d=new Date(schedule.dueAt+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+index*r.every*(r.unit==='weeks'?7:1));}
 if(!Number.isFinite(+d)||d.getUTCFullYear()>9999||d.getUTCFullYear()<100)return null;
 return d.toISOString().slice(0,10);
}
/** Advance only through contiguous completed occurrences; missed work stays due.
 * @param {any} schedule @param {any[]} history @param {number} now */
export function nextOccurrence(schedule,history,now=Date.now()){
 if(!validRecurrence(schedule.recurrence,schedule.dueAt))return null;
 const completed=new Set(history.filter(e=>e.scheduleId===schedule.id&&e.status==='completed'&&Number.isFinite(Date.parse(e.performedAt))&&Date.parse(e.performedAt)<=now).map(e=>e.occurrenceDueAt));
 for(let index=0;index<=completed.size;index++){const due=occurrenceAt(schedule,index);if(!due||!completed.has(due))return due;}
 return null;
}
/** Accept the current or already completed occurrence, never jump over a gap.
 * @param {any} schedule @param {any[]} history @param {any} due */
export function validCompletionOccurrence(schedule,history,due){
 if(!isCalendarDate(due))return false;
 const next=nextOccurrence(schedule,history);if(!next||due>next)return false;
 const count=new Set(history.filter(e=>e.scheduleId===schedule.id&&e.status==='completed').map(e=>e.occurrenceDueAt)).size;
 for(let i=0;i<=count;i++){if(occurrenceAt(schedule,i)===due)return true;}
 return false;
}
