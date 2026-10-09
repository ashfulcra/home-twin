import { describe, it, expect } from 'vitest';
import { projectHome } from './projection.js';
const home = {schemaVersion:1,id:'example-home',name:'Example Home',sources:[{id:'manual',verifiedAt:'2026-07-18',path:'/home/hvac.md'}],equipment:[{id:'heat',name:'Heating',sourceIds:['manual'],roomId:null}],rooms:[],contacts:[],schedules:[{id:'inspect',name:'Inspect heating',kind:'maintenance',equipmentId:'heat',dueAt:null,sourceIds:['manual']},{id:'update',name:'Software updates',kind:'automation',equipmentId:null,dueAt:'2026-10-01',sourceIds:['manual']}],history:[]};
describe('home knowledge projection',()=>{
 it('leaves service history and provider unknown instead of treating an automation as completed maintenance',()=>{
  const view=projectHome(home,'2026-10-09');
  expect(view.equipment[0].lastService).toBeNull();
  expect(view.equipment[0].provider).toBeNull();
  expect(view.schedules[0].state).toBe('unscheduled');
  expect(view.schedules[1].state).toBe('past-due');
 });
 it('uses actual completed maintenance and preserves evidence links for unplaced equipment',()=>{
  const view=projectHome({...home,history:[{id:'event',kind:'maintenance',status:'completed',equipmentId:'heat',performedAt:'2026-10-01',contactId:'plumber',sourceIds:['manual']}],contacts:[{id:'plumber',name:'Example Services'}]},'2026-10-09');
  expect(view.equipment[0].lastService.performedAt).toBe('2026-10-01');
  expect(view.equipment[0].provider.name).toBe('Example Services');
  expect(view.equipment[0].room).toBeNull();
  expect(view.equipment[0].sources[0].path).toBe('/home/hvac.md');
  expect(view.sources[0].freshness).toBe('stale');
 });
 it('does not turn unknown or invalid dates into current verification',()=>{
  const view=projectHome({...home,sources:[{id:'manual',verifiedAt:null}]},'2026-10-09');
  expect(view.sources[0].freshness).toBe('unknown');
 });
});
