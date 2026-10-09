import {test,expect} from 'vitest';
import {answerHome} from './care.js';
import {projectHome} from './projection.js';
import {reconcileContributions,validateContribution} from './contributions.js';
test('answers actual service and provider, preserves missing plumber',()=>{
 const home=projectHome({equipment:[{id:'f',name:'Furnace',system:'Heating',sourceIds:['manual']}],contacts:[{id:'p',name:'Example HVAC',trade:'HVAC'}],history:[{id:'v',equipmentId:'f',kind:'maintenance',status:'completed',performedAt:'2026-01-01',contactId:'p'}],sources:[{id:'manual'}]},'2026-10-01');
 expect(answerHome(home,'when was furnace last maintained')[0].text).toContain('2026-01-01');expect(answerHome(home,'who to call for furnace')[0].text).toContain('Example HVAC');expect(answerHome(home,'who is the plumber')[0].text).toContain('not recorded');
});
test('chore completion is independent from schedule and retry has one effect',()=>{
 const home={id:'h',revision:1,equipment:[],schedules:[{id:'trash',name:'Take garbage out',kind:'chore',dueAt:'2026-01-01'}]};
 const c={id:'completion',homeId:'h',kind:'task-completion',authorUserId:'owner',scheduleId:'trash',text:'Done',performedAt:'2026-01-01',recordedAt:'2026-01-02'};
 const result=reconcileContributions(home,[c,c]);expect(result.home.history).toHaveLength(1);expect(projectHome(result.home,'2026-10-01').schedules[0].state).toBe('completed');expect(home.schedules[0].dueAt).toBe('2026-01-01');
});
test('schedule requires explicit valid due date and chore kind',()=>{expect(()=>validateContribution({id:'11111111-1111-4111-8111-111111111111',homeId:'h',kind:'schedule',value:'Garbage',field:'chore',dueAt:'guess'})).toThrow('due');});
test('date-only care deadline follows the home calendar day',()=>{const h={timezone:'America/New_York',schedules:[{id:'s',dueAt:'2026-10-09'}]};expect(projectHome(h,'2026-10-10T01:00:00Z').schedules[0].state).toBe('upcoming');expect(projectHome(h,'2026-10-10T05:00:00Z').schedules[0].state).toBe('past-due');});
