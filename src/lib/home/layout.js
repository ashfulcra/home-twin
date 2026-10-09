/** @param {string} input */
export function parseLength(input){
 if(typeof input!=='string'||input.length>100)throw new Error('Enter a length with feet or inches');
 const raw=input.trim();const text=raw.toLowerCase().replace(/[′’]/g,"'").replace(/[″“”]/g,'"');
 let feet=NaN;let m=text.match(/^(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\s*(?:(\d+(?:\.\d+)?)\s*(?:in|inch|inches|"))?$/);
 if(m)feet=Number(m[1])+Number(m[2]??0)/12;
 else if((m=text.match(/^(\d+(?:\.\d+)?)\s*(?:in|inch|inches|")$/)))feet=Number(m[1])/12;
 else if((m=text.match(/^(\d+(?:\.\d+)?)\s*(?:m|meters|metres)$/)))feet=Number(m[1])/0.3048;
 else if(/^\d+(?:\.\d+)?$/.test(text))feet=Number(text);
 if(!Number.isFinite(feet)||feet<=0||feet>1000)throw new Error('Use a positive length: 8.5ft, 72 inches, or 8\' 3.25"');
 return {feet,original:raw,units:'feet'};
}
/** @param {string} kind */
export function starterPlan(kind){
 const layouts={simple:[['Living Room',0,0,16,14],['Kitchen',16,0,12,14],['Bedroom',0,14,16,12],['Bath',16,14,12,12]],hall:[['Bedroom 1',0,0,12,12],['Hall',12,0,5,28],['Bedroom 2',17,0,12,12],['Living Room',0,12,12,16],['Kitchen',17,12,12,16]],lshape:[['Living Room',0,0,18,14],['Kitchen',18,0,12,14],['Bedroom',0,14,18,12]]};
 const rows=layouts[/** @type {keyof typeof layouts} */(kind)]??layouts.simple;
 return {schemaVersion:1,level:'Main floor',accuracy:'estimated',origin:'synthetic-starter',rooms:rows.map((r,i)=>({id:`room-${i+1}`,name:String(r[0]),x:Number(r[1]),y:Number(r[2]),w:Number(r[3]),h:Number(r[4]),accuracy:'estimated',measurements:{}}))};
}
/** @param {string} names @param {string} adjacency */
export function interviewPlan(names,adjacency){
 const labels=[...new Set(names.split(/[,\n]/).map(s=>s.trim()).filter(Boolean))];if(!labels.length||labels.length>40)throw new Error('List between 1 and 40 rooms');
 const rooms=labels.map((name,i)=>({id:`room-${i+1}`,name,x:(i%3)*14,y:Math.floor(i/3)*14,w:14,h:14,accuracy:'estimated',measurements:{}}));
 for(const line of adjacency.split(/[;\n]/)){const pair=line.split('->').map(s=>s.trim());if(pair.length!==2)continue;const a=rooms.find(r=>r.name===pair[0]),b=rooms.find(r=>r.name===pair[1]);if(a&&b&&a!==b){b.x=a.x+a.w;b.y=a.y;}}
 return {schemaVersion:1,level:'Main floor',accuracy:'estimated',origin:'layout-interview',interview:{roomNames:names,adjacency,directionAssumption:'Adjacent pairs initially placed east; correct direction/positions in editor.'},rooms};
}
/** Whitelist portable drawing data; never retain commands, file paths or authority.
 * @param {any} input */
export function validatePlan(input){
 if(!input||input.schemaVersion!==1||!Array.isArray(input.rooms)||!input.rooms.length||input.rooms.length>40)throw new Error('Invalid floor-plan rooms');
 const ids=new Set();const rooms=input.rooms.map((/** @type {any} */ r)=>{
  if(!r||typeof r.id!=='string'||!/^room-[a-z0-9-]{1,60}$/.test(r.id)||ids.has(r.id)||typeof r.name!=='string'||!r.name.trim()||r.name.length>120)throw new Error('Room names and IDs must be valid and unique');ids.add(r.id);
  for(const axis of ['x','y','w','h'])if(typeof r[axis]!=='number'||!Number.isFinite(r[axis])||Math.abs(r[axis])>1000||(['w','h'].includes(axis)&&r[axis]<=0))throw new Error('Invalid room coordinates');
  /** @type {any} */ const measurements={};for(const side of ['north','east','south','west'])if(r.measurements?.[side])measurements[side]=parseLength(r.measurements[side].original);
  return {id:r.id,name:r.name.trim(),x:r.x,y:r.y,w:r.w,h:r.h,accuracy:!Object.keys(measurements).length?'estimated':'partly-measured',measurements};
 });
 const level=typeof input.level==='string'?input.level.trim().slice(0,120):'Main floor';
 return {schemaVersion:1,level,accuracy:'estimated',origin:['synthetic-starter','layout-interview','edited-draft'].includes(input.origin)?input.origin:'edited-draft',...(input.interview?{interview:{roomNames:String(input.interview.roomNames??'').slice(0,10000),adjacency:String(input.interview.adjacency??'').slice(0,10000),directionAssumption:'Initial positions are estimates; verify directions.'}}:{}),rooms};
}
/** @param {any} plan */
export function planWarnings(plan){const warnings=[];for(let i=0;i<plan.rooms.length;i++)for(let j=i+1;j<plan.rooms.length;j++){const a=plan.rooms[i],b=plan.rooms[j];if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)warnings.push(`${a.name} overlaps ${b.name}; correct positions or dimensions.`);}return warnings;}
