import {test,expect} from 'vitest';
import {projectHome} from './projection.js';
import {reconcileContributions,validateContribution} from './contributions.js';
const uuid='11111111-1111-4111-8111-111111111111';
const schedule={id:'s',name:'Filter inspection',kind:'maintenance',dueAt:'2026-01-31',recurrence:{every:1,unit:'months'}};
const h={id:'h',revision:1,timezone:'America/New_York',equipment:[],schedules:[schedule],history:[]};
/** @param {string} id @param {string|undefined} date */
const done=(id,date)=>({id,homeId:'h',kind:'task-completion',scheduleId:'s',occurrenceDueAt:date,performedAt:date??'2026-01-01',recordedAt:'2026-03-31T20:00:00Z',authorUserId:'member',text:'Inspected'});
test('monthly recurrence clamps February but retains the original month-end anchor',()=>{
 const r=reconcileContributions(h,[done('a','2026-01-31'),done('b','2026-02-28')]);
 expect(r.review).toEqual([]);expect(projectHome(r.home,'2026-03-10T12:00:00Z').schedules[0]).toMatchObject({dueAt:'2026-03-31',state:'upcoming',completion:null});
 expect(h.schedules[0].dueAt).toBe('2026-01-31');
});
test('duplicate reports and retries advance only one occurrence; overdue occurrences are not skipped',()=>{
 const a=done('a','2026-01-31'),b=done('b','2026-01-31');
 const r=reconcileContributions(h,[a,a,b]);
 expect(r.home.history).toHaveLength(2);expect(projectHome(r.home,'2026-03-10T12:00:00Z').schedules[0]).toMatchObject({dueAt:'2026-02-28',state:'past-due'});
 expect(projectHome(reconcileContributions(r.home,[a,b]).home,'2026-03-10T12:00:00Z').schedules[0].dueAt).toBe('2026-02-28');
});
test('missing, off-cadence and skipped occurrence completion remain held',()=>{
 for(const date of [undefined,'2026-02-27','2026-03-31']){const r=reconcileContributions(h,[done('bad',date)]);expect(r.accepted).toEqual([]);expect(r.review[0].reason).toBe('invalid-task-occurrence');expect(r.home.history).toEqual([]);}
});
test('explicit recurrence is validated and survives the contribution boundary',()=>{
 const input={id:uuid,homeId:'h',kind:'schedule',value:'Garbage',field:'chore',dueAt:'2026-01-01',recurrence:{every:2,unit:'weeks'}};
 expect(validateContribution(input).recurrence).toEqual(input.recurrence);
 expect(reconcileContributions({...h,schedules:[]},[{...input,authorUserId:'member'}]).home.schedules[0].recurrence).toEqual(input.recurrence);
 for(const recurrence of [{every:0,unit:'days'},{every:1.5,unit:'weeks'},{every:1,unit:'years'},{every:999999,unit:'days'}])expect(()=>validateContribution({...input,recurrence})).toThrow('recurrence');
 for(const dueAt of ['2026-02-30','2026-01-01T12:00:00Z'])expect(()=>validateContribution({...input,dueAt})).toThrow('recurrence');
});
test('weekly due date follows local calendar through DST and leap-day recurrence stays anchored',()=>{
 const weekly={...h,schedules:[{...schedule,dueAt:'2026-03-01',recurrence:{every:1,unit:'weeks'}}],history:[{...done('a','2026-03-01'),status:'completed'}]};
 expect(projectHome(weekly,'2026-03-09T01:00:00Z').schedules[0]).toMatchObject({dueAt:'2026-03-08',state:'upcoming'});
 expect(projectHome(weekly,'2026-03-09T05:00:00Z').schedules[0].state).toBe('past-due');
 const leap={...h,schedules:[{...schedule,dueAt:'2024-02-29',recurrence:{every:12,unit:'months'}}],history:[{...done('a','2024-02-29'),status:'completed'}]};
 expect(projectHome(leap,'2025-01-01').schedules[0].dueAt).toBe('2025-02-28');
});

test("historical years that JavaScript reinterprets are rejected",()=>{expect(()=>validateContribution({id:uuid,homeId:"h",kind:"schedule",value:"Test",field:"chore",dueAt:"0099-01-31",recurrence:{every:1,unit:"months"}})).toThrow("recurrence");});
