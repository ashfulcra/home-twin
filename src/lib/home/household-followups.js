import {buildAgentBrief} from './agent-brief.js';
/** Household projection from this request's current records; no private journal export.
 * @param {any} home @param {any} context */
export function buildHouseholdFollowups(home,context){
 if(home.id!==context.homeId||home.ownerUserId!==context.ownerUserId||!Number.isSafeInteger(home.revision)||!['maintainer','contributor','viewer'].includes(context.role)||typeof context.fileVersion!=='string'||!context.fileVersion)throw Error('Current scoped home, role and version required');
 const brief=buildAgentBrief(home,{role:context.role});
 const questions=brief.questions.slice(0,100).map(q=>({id:`${q.kind}:${q.entityId??'home'}`,kind:q.kind,entityId:typeof q.entityId==='string'?q.entityId:null,prompt:String(q.prompt).slice(0,800),capture:String(q.capture).slice(0,100),destination:q.kind==='layout'?'Layout':q.kind==='systems'?'Household':'Sources'}));
 return {schema:'home-twin-household-followups/1',homeId:home.id,revision:home.revision,fileVersion:context.fileVersion,questions,totalQuestions:brief.questions.length,reviewCount:Math.max(0,Number(context.reviewCount)||0),unavailableCount:Math.max(0,Number(context.unavailableCount)||0)};
}

/** @param {any} home @param {any} request */
export function resolveSourcePrefill(home,request){if(!request||request.homeId!==home.id||request.revision!==home.revision||typeof request.title!=='string'||request.title.length>500||typeof request.entityId!=='string'||(request.entityId&&!home.equipment?.some((/** @type {any} */ e)=>e.id===request.entityId)))return null;return {homeId:home.id,revision:home.revision,title:request.title,entityId:request.entityId};}
