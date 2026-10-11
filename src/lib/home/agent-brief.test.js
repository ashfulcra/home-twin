import {test,expect} from 'vitest';
import {buildAgentBrief} from './agent-brief.js';
const home={schemaVersion:1,revision:1,id:'example-home',name:'Example home',rooms:[],equipment:[{id:'heat',name:'Heating system',inventoryStatus:'needs-details',model:null,sourceIds:['intake'],vendorToken:'do-not-export'}],contacts:[],history:[],schedules:[],sources:[{id:'intake',title:'Intake',path:'/shared/home-twin/example-home/sources/intake.json',verifiedAt:null}],notes:[],plan:null};
const owner='00000000-0000-4000-8000-000000000001';
const member='00000000-0000-4000-8000-000000000002';
test('a contributor bootstrap pairs with the resolved owner and preserves the same home',()=>{
 const b=buildAgentBrief(home,{role:'contributor',ownerUserId:owner,userId:member,root:'/shared/home-twin/example-home'});
 expect(b.gettingStarted.status).toBe('ready');
 expect(b.gettingStarted.context).toEqual({homeId:'example-home',homeName:'Example home',ownerUserId:owner,userId:member,role:'contributor',acceptedRoot:'/shared/home-twin/example-home',contributionRoot:'/shared/home-twin/example-home/contributions'});
 expect(b.gettingStarted.actions).toEqual(['verify-access','read-existing-home','contribute-own-account','pair-owner-mesh']);
 expect(b.gettingStarted.prompt).toContain(owner);expect(b.gettingStarted.prompt).toContain(member);
 expect(b.gettingStarted.prompt).toContain('fulcra-mesh/SKILL.md');expect(b.gettingStarted.prompt).toContain('home-twin:example-home');
 expect(b.gettingStarted.connectionStatus).toBe('not-verified');expect(b.permissions.canPublishAcceptedSnapshot).toBe(false);
});
test('viewer handoff cannot instruct contributions or peer sharing',()=>{
 const b=buildAgentBrief(home,{role:'viewer',ownerUserId:owner,userId:member,root:'/shared/home-twin/example-home'});
 expect(b.gettingStarted.actions).toEqual(['verify-access','read-existing-home']);
 expect(b.gettingStarted.context?.contributionRoot).toBeNull();expect(b.gettingStarted.prompt).not.toContain('fulcra-mesh/SKILL.md');
});
test('owner bootstrap continues the current record without pairing to itself or exporting its private root',()=>{
 const b=buildAgentBrief(home,{role:'maintainer',ownerUserId:owner,userId:owner,root:'/home/twin'});
 expect(b.gettingStarted.actions).toEqual(['verify-access','read-existing-home','maintain-accepted-home']);
 expect(b.gettingStarted.context?.acceptedRoot).toBe('/home/twin');expect(b.gettingStarted.context?.contributionRoot).toBeNull();
 expect(b.gettingStarted.prompt).not.toContain('fulcra-mesh/SKILL.md');
});
test('missing identity or inconsistent access fails closed rather than guessing a peer or contribution path',()=>{
 for(const options of [{role:'contributor'},{role:'contributor',ownerUserId:owner,userId:owner,root:'/shared/home-twin/example-home'},{role:'maintainer',ownerUserId:owner,userId:member,root:'/home/twin'},{role:'viewer',ownerUserId:owner,userId:member,root:'/unrelated-private-vault'},{role:'unverified',ownerUserId:owner,userId:member}]){
  const b=buildAgentBrief(home,options);expect(b.gettingStarted.status).toBe('needs-verified-context');expect(b.gettingStarted.prompt).toBeNull();
 }
});
test('missing or coerced identifiers cannot become a seemingly verified agent context',()=>{
 for(const id of [undefined,null,123,['example-home']]){
  const b=buildAgentBrief({...home,id},{role:'maintainer',ownerUserId:owner,userId:owner,root:'/home/twin'});
  expect(b.gettingStarted.status).toBe('needs-verified-context');expect(b.gettingStarted.prompt).toBeNull();
 }
 const b=buildAgentBrief(home,{role:'maintainer',ownerUserId:[owner],userId:[owner],root:'/home/twin'});
 expect(b.gettingStarted.status).toBe('needs-verified-context');
});
test('unknown inventory yields targeted questions without guessed service dates or geometry',()=>{
 const b=buildAgentBrief(home,{role:'maintainer',generatedAt:'2026-10-09T15:00:00Z'});
 expect(b.home.equipment[0]?.model).toBeNull();expect(b.home.equipment[0]?.lastService).toBeNull();
 expect(b.questions).toEqual(expect.arrayContaining([expect.objectContaining({kind:'equipment-details',entityId:'heat'}),expect.objectContaining({kind:'service-history',entityId:'heat'}),expect.objectContaining({kind:'layout'})]));
 expect(JSON.stringify(b)).not.toContain('do-not-export');expect(home.equipment[0].model).toBeNull();
});
test('known service/provider evidence survives; contributors are not appointed maintainer',()=>{
 const h={...home,contacts:[{id:'p',name:'Example provider',phone:'555-0100',trade:'HVAC'}],equipment:[{id:'heat',name:'Heating',model:'Known model',contactId:'p'}],history:[{id:'visit',kind:'maintenance',status:'completed',equipmentId:'heat',performedAt:'2026-09-01',summary:'Recorded visit'}]};
 const b=buildAgentBrief(h,{role:'contributor',generatedAt:'2026-10-09T15:00:00Z'});
 expect(b.home.equipment[0]?.lastService?.performedAt).toBe('2026-09-01');expect(b.home.equipment[0]?.provider?.name).toBe('Example provider');expect(b.permissions.canPublishAcceptedSnapshot).toBe(false);
 expect(b.questions.some(q=>q.kind==='service-history'&&q.entityId==='heat')).toBe(false);
});
test('nested extras are excluded and provider attribution is retained',()=>{
 const h={...home,knowledgeGaps:['Known gap',{apiKey:'nested-secret'}],sources:[{id:'s',title:'Source',path:'/source',origin:{vendorToken:'nested-secret'}}],contacts:[{id:'p',name:'Provider',sourceIds:['s'],authorUserId:'member',recordedAt:'2026-09-01',fieldEvidence:{phone:[{contributionId:'c',authorUserId:'member',recordedAt:'2026-09-01',value:'555-0100',apiKey:'nested-secret'}]}}],equipment:[{id:'heat',name:'Heating',contactId:'p',fieldEvidence:{model:[{contributionId:'c',authorUserId:'member',recordedAt:'2026-09-01',value:'Model',apiKey:'nested-secret'}],vendorToken:[{value:'nested-secret'}]}}]};
 const b=buildAgentBrief(h);
 expect(JSON.stringify(b)).not.toContain('nested-secret');
 expect(b.home.equipment[0].provider.sourceIds).toEqual(['s']);
 expect(b.home.equipment[0].provider.authorUserId).toBe('member');
 expect(b.home.equipment[0].fieldEvidence.model[0].contributionId).toBe('c');
});

test('source reconstruction prevents a redundant start-from-nothing layout interview',()=>{
 const reconstruction={schemaVersion:1,status:'draft-needs-review',units:'feet',source:{sha256:'a'.repeat(64)},levels:[{id:'main',elevationFeet:null}],rooms:[{id:'living',name:'Living',level:'main',polygon:[[0,0],[10,0],[10,10],[0,10]],sourcePage:2,sourceSheet:'A-1',heightFeet:null}]};
 const b=buildAgentBrief({...home,reconstruction});expect(b.questions.some(q=>q.kind==='layout')).toBe(false);expect(b.home.reconstructionAvailable).toBe(true);expect(b.home.reconstructionRoomCount).toBe(1);expect(b.home.acceptedPlanAvailable).toBe(false);
 const invalid=buildAgentBrief({...home,reconstruction:{rooms:[{}]}});expect(invalid.questions.some(q=>q.kind==='layout')).toBe(true);
});

/** Synthetic building: removal of model context would prevent an agent answering room/opening questions. @returns {any} */
const architecture = () => ({
  schemaVersion: 1,
  units: 'feet',
  levels: [{ id: 'main', label: 'Main', elevationFeet: 0, heightFeet: 10 }],
  rooms: [
    {
      id: 'living',
      name: 'Living',
      level: 'main',
      polygon: [
        [0, 0],
        [20, 0],
        [20, 15],
        [0, 15]
      ],
      heightFeet: 10,
      basis: { type: 'representative', assumptionIds: ['height'] }
    }
  ],
  walls: [
    {
      id: 'south',
      roomId: 'living',
      level: 'main',
      start: [0, 15],
      end: [20, 15],
      heightFeet: 10,
      thicknessFeet: 0.5,
      openings: [
        {
          id: 'door',
          kind: 'door',
          offsetFeet: 4,
          widthFeet: 3,
          sillFeet: 0,
          heightFeet: 7,
          basis: 'estimated'
        }
      ]
    }
  ],
  features: [
    {
      id: 'fireplace',
      roomId: 'living',
      level: 'main',
      name: 'Fireplace',
      kind: 'fireplace',
      position: [10, 0],
      size: [4, 2, 5],
      sourcePage: 7,
      details: { sourceEvidence: 'Fireplace shown in room elevation', product: 'unknown' }
    }
  ],
  assumptions: [{ id: 'height', subject: 'Ceiling', value: 10, reason: 'Representative height' }],
  excludedFeatures: [
    { id: 'unbuilt-stair', reason: 'Household reported not built', sourcePages: [2] }
  ],
  sourceSpecifications: [
    {
      subject: 'Ceiling',
      sourcePage: 8,
      specification: 'Coffered ceiling drawn',
      installedStatus: 'unverified'
    }
  ]
});
test('portable architectural context answers room and aperture questions without upgrading estimates', () => {
  const m = architecture();
  const before = JSON.stringify(m);
  const b = buildAgentBrief({ ...home, reconstruction: { buildingModel: m } }, { role: 'viewer' });
  const a = b.home.architecture;
  expect(a.status).toBe('available');
  expect(a.units).toBe('feet');
  expect(a.rooms[0].polygon[2]).toEqual([20, 15]);
  expect(a.rooms[0].sourcePage).toBeNull();
  expect(a.rooms[0].basis.assumptionIds).toEqual(['height']);
  expect(a.walls[0].openings[0]).toMatchObject({
    kind: 'door',
    offsetFeet: 4,
    widthFeet: 3,
    basis: { note: 'estimated' }
  });
  expect(a.features[0]).toMatchObject({
    roomId: 'living',
    sourcePage: 7,
    details: { product: 'unknown' }
  });
  expect(a.sourceSpecifications[0].installedStatus).toBe('unverified');
  expect(a.assumptions[0].value).toBe(10);
  expect(a.excludedFeatures[0].id).toBe('unbuilt-stair');
  expect(b.questions.some((q) => q.kind === 'layout')).toBe(false);
  expect(b.permissions.canPublishAcceptedSnapshot).toBe(false);
  expect(JSON.stringify(m)).toBe(before);
});
test('architectural handoff excludes arbitrary nested extras instead of serializing them', () => {
  const m = architecture();
  m.apiKey = 'architecture-secret';
  m.levels[0].secret = 'architecture-secret';
  m.rooms[0].basis.extra = { token: 'architecture-secret' };
  m.walls[0].openings[0].secret = 'architecture-secret';
  m.features[0].details.apiKey = 'architecture-secret';
  m.features[0].details.sourceSpecification = { token: 'architecture-secret' };
  m.assumptions[0].value = { apiKey: 'architecture-secret' };
  m.excludedFeatures[0].token = 'architecture-secret';
  m.sourceSpecifications[0].apiKey = 'architecture-secret';
  const a = buildAgentBrief({ ...home, reconstruction: { buildingModel: m } }).home.architecture;
  expect(a.status).toBe('available');
  expect(JSON.stringify(a)).not.toContain('architecture-secret');
  expect(a.features[0].details.sourceEvidence).toContain('elevation');
  expect(a.assumptions[0].value).toBeNull();
});
test('invalid and absent architecture stay explicit while home knowledge remains available', () => {
  const m = architecture();
  m.walls[0].openings[0].widthFeet = 40;
  const b = buildAgentBrief({ ...home, reconstruction: { buildingModel: m } });
  expect(b.home.architecture.status).toBe('invalid');
  expect(b.home.equipment[0].name).toBe('Heating system');
  expect(b.questions.some((q) => q.kind === 'layout')).toBe(true);
  expect(buildAgentBrief(home).home.architecture.status).toBe('not-recorded');
});
test('minimal valid architecture without optional collections still exports its rooms', () => {
  const m = architecture();
  delete m.assumptions;
  delete m.features;
  delete m.walls;
  delete m.excludedFeatures;
  delete m.sourceSpecifications;
  const a = buildAgentBrief({ ...home, reconstruction: { buildingModel: m } }).home.architecture;
  expect(a.status).toBe('available');
  expect(a.rooms[0].name).toBe('Living');
  expect(a.assumptions).toEqual([]);
  expect(a.walls).toEqual([]);
});
test('an oversized architecture directs the agent to the current home rather than silently dropping model context', () => {
  const m = architecture();
  m.features = Array.from({ length: 700 }, (_, i) => ({
    ...m.features[0],
    id: `feature-${i}`,
    details: { sourceEvidence: 'x'.repeat(4000) }
  }));
  const b = buildAgentBrief({ ...home, reconstruction: { buildingModel: m } });
  expect(b.home.architecture.status).toBe('size-limited');
  expect(b.home.architecture.counts.features).toBe(700);
  expect(b.questions.some((q) => q.kind === 'layout')).toBe(false);
});
test('malformed supplemental rows cannot hide otherwise valid architectural and equipment context',()=>{
 const m=architecture();m.sourceSpecifications.unshift(null,'not a specification');m.excludedFeatures.unshift(null);
 const b=buildAgentBrief({...home,reconstruction:{buildingModel:m}});
 expect(b.home.architecture.status).toBe('available');expect(b.home.architecture.sourceSpecifications).toHaveLength(1);expect(b.home.architecture.excludedFeatures[0].id).toBe('unbuilt-stair');expect(b.home.equipment).toHaveLength(1);
});
test('architectural room roles and specification sheets survive without arbitrary metadata',()=>{
 const m=architecture();m.rooms[0].geometryRole='nested-closet';m.sourceSpecifications[0].sourceSheet='A2';
 const a=buildAgentBrief({...home,reconstruction:{buildingModel:m}}).home.architecture;
 expect(a.rooms[0].geometryRole).toBe('nested-closet');expect(a.sourceSpecifications[0].sourceSheet).toBe('A2');
});
