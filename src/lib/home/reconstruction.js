/** @typedef {{id:string,name:string,level:string,polygon:number[][],sourcePage:number,sourceSheet:string,heightFeet:number|null,geometryStatus:string,constructionStatus:string}} RoomFootprint */
/** @typedef {{id:string,elevationFeet:number|null}} FloorLevel */
/** Bounded portable geometry from source evidence. No wall thickness, level datum or north is inferred. */
const text=(/** @type {any} */v,limit=500)=>typeof v==='string'?v.slice(0,limit):'';
const finite=(/** @type {any} */v)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=10000;
const cross=(/** @type {number[]} */a,/** @type {number[]} */b,/** @type {number[]} */c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
/** @param {number[]} a @param {number[]} b @param {number[]} p */
function onSegment(a,b,p){return Math.abs(cross(a,b,p))<1e-9&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);}
/** @param {number[]} a @param {number[]} b @param {number[]} c @param {number[]} d */
function segmentsIntersect(a,b,c,d){return (cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);}
/** @param {number[][]} points @param {number} padding */
export function footprintBounds(points,padding=3){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const p of points){minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);}return points.length?{x:minX-padding,y:minY-padding,w:maxX-minX+2*padding,h:maxY-minY+2*padding}:{x:0,y:0,w:1,h:1};}
/** @param {any} input */
export function validateReconstruction(input){
 if(!input||input.schemaVersion!==1||input.units!=='feet'||input.status!=='draft-needs-review'||!Array.isArray(input.levels)||!input.levels.length||input.levels.length>20||!Array.isArray(input.rooms)||!input.rooms.length||input.rooms.length>200||!input.source||!/^[a-f0-9]{64}$/i.test(input.source.sha256))throw Error('Invalid reconstruction evidence');
 const ids=new Set();
 /** @type {FloorLevel[]} */ const levels=input.levels.map((/** @type {any} */l)=>{if(!l||!text(l.id,80)||l.id.length>80||ids.has(l.id)||(l.elevationFeet!==null&&!finite(l.elevationFeet)))throw Error('Invalid floor levels');ids.add(l.id);return {id:text(l.id,80),elevationFeet:l.elevationFeet};});const roomIds=new Set();
 /** @type {RoomFootprint[]} */ const rooms=input.rooms.map((/** @type {any} */r)=>{
  if(!r||!text(r.id,100)||r.id.length>100||roomIds.has(r.id)||!text(r.name,120)||!ids.has(r.level)||!Number.isInteger(r.sourcePage)||r.sourcePage<1||r.sourcePage>10000||!text(r.sourceSheet,100)||!Array.isArray(r.polygon)||r.polygon.length<3||r.polygon.length>500||r.polygon.some((/** @type {any} */p)=>!Array.isArray(p)||p.length!==2||!p.every(finite))||(r.heightFeet!==null&&(!finite(r.heightFeet)||r.heightFeet<=0||r.heightFeet>100)))throw Error('Invalid room footprint');roomIds.add(r.id);
  const polygon=r.polygon.map((/** @type {number[]} */p)=>[...p]);if(polygon.length>3&&polygon[0][0]===polygon.at(-1)[0]&&polygon[0][1]===polygon.at(-1)[1])polygon.pop();let area=0;
  for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];if(a[0]===b[0]&&a[1]===b[1])throw Error('Repeated polygon vertex');area+=a[0]*b[1]-b[0]*a[1];for(let j=i+2;j<polygon.length;j++){if(i===0&&j===polygon.length-1)continue;const c=polygon[j],d=polygon[(j+1)%polygon.length];if(segmentsIntersect(a,b,c,d))throw Error('Crossed footprint');}}
  if(Math.abs(area)<0.001)throw Error('Empty footprint');
  return {id:text(r.id,100),name:text(r.name,120),level:r.level,polygon,sourcePage:r.sourcePage,sourceSheet:text(r.sourceSheet,100),heightFeet:r.heightFeet,geometryStatus:text(r.geometryStatus,120),constructionStatus:text(r.constructionStatus,120)};
 });
 /** @type {{id:string,level:string,sourcePage:number,sourceSheet:string,closed:boolean,fillAllowed:boolean,polyline:number[][]}[]} */
 const envelopes=(input.envelopes??[]).map((/** @type {any} */e)=>{
  if(!Array.isArray(input.envelopes)||input.envelopes.length>30||!e||typeof e.id!=='string'||!e.id||e.id.length>100||!ids.has(e.level)||!Number.isInteger(e.sourcePage)||e.sourcePage<1||!text(e.sourceSheet,100)||typeof e.closed!=='boolean'||!Array.isArray(e.polyline)||e.polyline.length<(e.closed?3:2)||e.polyline.length>500||e.polyline.some((/** @type {any} */p)=>!Array.isArray(p)||p.length!==2||!p.every(finite)))throw Error('Invalid exterior evidence');
  const polyline=e.polyline.map((/** @type {number[]} */p)=>[...p]);const count=e.closed?polyline.length:polyline.length-1;
  for(let i=0;i<count;i++){const a=polyline[i],b=polyline[(i+1)%polyline.length];if(a[0]===b[0]&&a[1]===b[1])throw Error('Repeated exterior vertex');for(let j=i+2;j<count;j++){if(e.closed&&i===0&&j===count-1)continue;if(segmentsIntersect(a,b,polyline[j],polyline[(j+1)%polyline.length]))throw Error('Crossed exterior line');}}
  return {id:e.id,level:e.level,sourcePage:e.sourcePage,sourceSheet:text(e.sourceSheet,100),closed:e.closed,fillAllowed:false,polyline};
 });
 return {schemaVersion:1,id:text(input.id,100),status:'draft-needs-review',units:'feet',coordinateFrame:{x:text(input.coordinateFrame?.x),y:text(input.coordinateFrame?.y),north:text(input.coordinateFrame?.north)||'unverified'},source:{file:text(input.source.file,200),sha256:input.source.sha256},levels,rooms,envelopes,limitations:Array.isArray(input.limitations)?input.limitations.slice(0,50).map((/** @type {any} */v)=>text(v,1000)):[]};
}
/** Single-floor illustration, never a physical extrusion or floor stack.
 * @param {any} input @param {string} level @param {number} turn */
export function reconstructionScene(input,level,turn=0){
 const m=validateReconstruction(input);if(!m.levels.some((/** @type {FloorLevel} */l)=>l.id===level)||!Number.isInteger(turn)||turn<0||turn>3)throw Error('Invalid floor or rotation');const [c,s]=[[1,0],[0,1],[-1,0],[0,-1]][turn];
 const point=(/** @type {number[]} */p,depth=0)=>{const x=p[0]*c-p[1]*s,y=p[0]*s+p[1]*c;return [x-y,(x+y)/2-depth];};
 const rooms=m.rooms.filter(r=>r.level===level).map(r=>({...r,bottom:r.polygon.map(p=>point(p)),top:r.polygon.map(p=>point(p,1.5)),label:point([r.polygon.reduce((n,p)=>n+p[0],0)/r.polygon.length,r.polygon.reduce((n,p)=>n+p[1],0)/r.polygon.length],1.5)})).sort((a,b)=>a.label[1]-b.label[1]);
 if(!rooms.length)throw Error('No footprints on this floor');const bounds=footprintBounds(rooms.flatMap(r=>[...r.top,...r.bottom]),4);
 return {kind:'illustrated-footprints',rooms,bounds};
}
