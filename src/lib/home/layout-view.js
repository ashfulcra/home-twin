import {validatePlan} from './layout.js';
/** Portable room footprints with illustrated depth only. East=x, south=y; rotations never reflect.
 * @param {any} input @param {number} turn */
export function schematicLayout(input,turn=0){
 const plan=validatePlan(input);if(!Number.isInteger(turn)||turn<0||turn>3)throw Error('Choose a quarter-turn orientation');
 const rotations=[[1,0],[0,1],[-1,0],[0,-1]];const [c,s]=rotations[turn];
 /** @param {number} x @param {number} y @param {number} [depth] */
 const point=(x,y,depth=0)=>{const east=x*c-y*s,south=x*s+y*c;return [east-south,(east+south)*0.5-depth];};
 /** @type {{id:string,name:string,accuracy:string,top:number[][],bottom:number[][],label:number[],depth:number}[]} */
 const rooms=plan.rooms.map((/** @type {any} */ r)=>{const corners=[[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]];return {id:r.id,name:r.name,accuracy:r.accuracy,top:corners.map(([x,y])=>point(x,y,1.5)),bottom:corners.map(([x,y])=>point(x,y)),label:point(r.x+r.w/2,r.y+r.h/2,1.5),depth:point(r.x+r.w/2,r.y+r.h/2)[1]};});rooms.sort((a,b)=>a.depth-b.depth||a.id.localeCompare(b.id));
 const points=rooms.flatMap(r=>[...r.top,...r.bottom]);const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);const x=Math.min(...xs)-4,y=Math.min(...ys)-4;
 return {status:'schematic',turn,rooms,bounds:{x,y,w:Math.max(...xs)-x+4,h:Math.max(...ys)-y+4},compass:{north:point(0,-1),east:point(1,0)},limits:'Room footprints with illustrated depth only. Heights, walls, openings and other structure are not established.'};
}
