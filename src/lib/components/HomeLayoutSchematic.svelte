<script lang="ts">
 import {schematicLayout} from '$lib/home/layout-view.js';
 let {plan,selectedRoom,onselect}=$props<{plan:any,selectedRoom:string,onselect:(id:string)=>void}>();let turn=$state(0);
 function scene(){try{return schematicLayout(plan,turn);}catch{return null;}}let drawing=$derived.by(scene);
 const points=(value:number[][])=>value.map(p=>p.join(',')).join(' ');
</script>
<p>Illustrated room footprints. Depth is for readability; wall heights, doors, windows and stairs are not represented.</p>
<button onclick={()=>turn=(turn+3)%4}>Rotate left</button><button onclick={()=>turn=(turn+1)%4}>Rotate right</button><button onclick={()=>turn=0}>Reset orientation</button>
{#if drawing}<svg viewBox={`${drawing.bounds.x} ${drawing.bounds.y} ${drawing.bounds.w} ${drawing.bounds.h}`} role="group" aria-label="Schematic 3D room footprints">
 {#each drawing.rooms as r}{#each [0,1,2,3] as i}<polygon points={points([r.top[i],r.top[(i+1)%4],r.bottom[(i+1)%4],r.bottom[i]])} fill={r.id===selectedRoom?'#8bb5a0':'#b9c8bf'} stroke="#647a70" stroke-width="0.1" />{/each}
 <polygon points={points(r.top)} fill={r.id===selectedRoom?'#d9eee4':'#f5f8f6'} stroke={r.id===selectedRoom?'#166aef':'#647a70'} stroke-width="0.15" role="button" tabindex="0" aria-label={`Select ${r.name} in schematic view`} onclick={()=>onselect(r.id)} onkeydown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onselect(r.id);}}}/><text x={r.label[0]} y={r.label[1]} text-anchor="middle" font-size="0.9">{r.name}</text>{/each}
 <g transform={`translate(${drawing.bounds.x+2.2},${drawing.bounds.y+2.2})`}><line x1="0" y1="0" x2={drawing.compass.north[0]} y2={drawing.compass.north[1]} stroke="#254a3c" stroke-width="0.14"/><text x={drawing.compass.north[0]*1.8} y={drawing.compass.north[1]*1.8} font-size="0.7">N</text><line x1="0" y1="0" x2={drawing.compass.east[0]} y2={drawing.compass.east[1]} stroke="#254a3c" stroke-width="0.14"/><text x={drawing.compass.east[0]*1.8} y={drawing.compass.east[1]*1.8} font-size="0.7">E</text></g>
</svg>{:else}<p>Complete the room names and dimensions to show the schematic view.</p>{/if}
<style>svg{width:100%;height:440px;border:1px solid #b6cbbd;border-radius:12px;background:white;margin:20px 0}polygon[role=button]{cursor:pointer}text{pointer-events:none;fill:#263f32}button{background:white;padding:10px 16px;border:1px solid #cadbd1;border-radius:8px;color:#254a3c;cursor:pointer;margin:8px 8px 8px 0}</style>
