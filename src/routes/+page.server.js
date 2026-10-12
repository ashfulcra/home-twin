import {env} from '$env/dynamic/private';import {env as publicEnv} from '$env/dynamic/public';import {existingHomeDeployment} from '$lib/home/deployment.js';
export function load(){return {existingHome:!!existingHomeDeployment({...publicEnv,...env})};}
