import {it,expect} from 'vitest';
import {createHomeFromAnswers} from './onboarding.js';
const answers={id:'example-home',name:'Our home',timezone:'America/New_York',systems:['Heating and cooling'],equipmentNames:'Furnace',rooms:'Kitchen\nBedroom'};
it('creates useful records without a floor plan or invented maintenance',()=>{
 const h=createHomeFromAnswers(answers,'owner','2026-10-09T12:00:00Z');
 expect(h.equipment.some(item=>item.name==='Furnace')).toBe(true);expect(h.history).toEqual([]);expect(h.schedules).toEqual([]);expect(h.contacts).toEqual([]);expect(h.plan).toBeNull();expect(h.equipment.every(item=>item.model===null)).toBe(true);expect(h.sources[0].verifiedAt).toBeNull();
});
it('rejects unsafe IDs, unsupported time zones and oversized interviews',()=>{
 expect(()=>createHomeFromAnswers({...answers,id:'../home'},'owner','now')).toThrow();
 expect(()=>createHomeFromAnswers({...answers,timezone:'Not/Real'},'owner','now')).toThrow();
 expect(()=>createHomeFromAnswers({...answers,equipmentNames:'x'.repeat(10001)},'owner','now')).toThrow();
});
