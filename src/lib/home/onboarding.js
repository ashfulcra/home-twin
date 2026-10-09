/** @param {any} answers @param {string} ownerUserId @param {string} recordedAt */
export function createHomeFromAnswers(answers,ownerUserId,recordedAt) {
 if(!answers||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(answers.id)||typeof answers.name!=='string'||!answers.name.trim()||answers.name.length>120)throw new Error('Enter a home name and valid home ID');
 try{new Intl.DateTimeFormat('en',{timeZone:answers.timezone}).format();}catch{throw new Error('Choose a valid time zone');}
 if(!Array.isArray(answers.systems)||answers.systems.length>30||answers.systems.some((/** @type {any} */ s)=>typeof s!=='string'||s.length>100))throw new Error('Invalid home systems');
 for(const field of ['equipmentNames','rooms'])if(answers[field]!==undefined&&(typeof answers[field]!=='string'||answers[field].length>10000))throw new Error('Interview response is too long');
 /** @param {string} text */ const lines=text=>[...new Set(text.split(/[\n,]/).map(s=>s.trim()).filter(Boolean))].slice(0,100);
 const root=`/shared/home-twin/${answers.id}`;
 const equipment=[...answers.systems.map((/** @type {string} */ system,/** @type {number} */ i)=>({id:`system-${i+1}`,name:`${system} system`,system,inventoryStatus:'needs-details'})),...lines(answers.equipmentNames??'').map((name,i)=>({id:`equipment-${i+1}`,name,system:'Not categorized',inventoryStatus:'reported'}))].map(item=>({...item,manufacturer:null,model:null,roomId:null,facts:[],sourceIds:['onboarding']}));
 return {schemaVersion:1,revision:1,id:answers.id,name:answers.name.trim(),timezone:answers.timezone,ownerUserId,members:[],createdAt:recordedAt,
 rooms:lines(answers.rooms??'').map((name,i)=>({id:`room-${i+1}`,name,accuracy:'estimated',sourceIds:['onboarding']})),equipment,contacts:[],schedules:[],history:[],notes:[],plan:null,
 sources:[{id:'onboarding',title:'Homeowner setup answers',path:`${root}/sources/onboarding.json`,origin:'self-report',recordedAt,verifiedAt:null}],
 knowledgeGaps:['Equipment details and service providers can be added as you learn them.','Maintenance dates and intervals have not been established.','Floor plan and measurements are optional; rooms start as estimated.']};
}
