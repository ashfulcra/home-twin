import {test,expect} from 'vitest';
import {createServer} from 'node:http';
import {captureDevice,adaptDevice} from '../../../scripts/device-capture.mjs';
const config={kind:'home-assistant',id:'example-temperature',homeId:'example-home',equipmentId:'sensor',metric:'temperature',entityId:'sensor.example',timestampField:'last_reported'};
test('HA report time is retained and receipt never substitutes missing observation time',()=>{
 const body={entity_id:'sensor.example',state:'72.5',last_reported:'2026-10-09T12:00:00Z',last_updated:'2026-10-08T12:00:00Z',attributes:{unit_of_measurement:'°F',apiKey:'private-secret'}};
 const a=adaptDevice(config,body,'2026-10-09T12:00:02Z');expect(a?.value).toBe(72.5);expect(a?.observedAt).toBe('2026-10-09T12:00:00.000Z');expect(a?.sourceTimeBasis).toBe('controller-report');expect(JSON.stringify(a)).not.toContain('private-secret');
 expect(adaptDevice(config,{...body,last_reported:undefined},'2026-10-10T12:00:02Z')?.observedAt).toBeNull();
 expect(adaptDevice(config,body,'2026-10-10T12:00:02Z')?.id).toBe(a?.id);
 expect(adaptDevice(config,{...body,entity_id:'sensor.wrong'},'2026-10-10T12:00:02Z')).toBeNull();
});
test('PurpleAir metric and device clock are explicit without exporting location or inventing missing values',()=>{
 const c={...config,kind:'purpleair',field:'pm2_5_atm',unit:'µg/m³',sensorId:'synthetic-device'};
 const a=adaptDevice(c,{SensorId:'synthetic-device',DateTime:'2026/10/09T12:00:00z',pm2_5_atm:8.5,lat:40,ssid:'private-secret'},'2026-10-09T12:00:02Z');
 expect(a?.value).toBe(8.5);expect(a?.observedAt).toBe('2026-10-09T12:00:00.000Z');expect(a?.sourceTimeBasis).toBe('device-clock');expect(JSON.stringify(a)).not.toContain('private-secret');
 expect(adaptDevice(c,{SensorId:'wrong'},'2026-10-09T12:00:02Z')).toBeNull();
 expect(adaptDevice(c,{SensorId:'synthetic-device'},'2026-10-09T12:00:02Z')?.value).toBeNull();
});
test('capture uses one GET and refuses redirects or HTTP failures without leaking credentials',async()=>{
 const server=createServer((req,res)=>{if(req.method!=='GET'||req.url!=='/api/states/sensor.example'||req.headers.authorization!=='Bearer private-secret'){res.writeHead(400).end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({entity_id:'sensor.example',state:'unavailable',last_reported:'2026-10-09T12:00:00Z'}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));const address=server.address();if(!address||typeof address==='string')throw Error('No server address');
 try{const a=await captureDevice({...config,baseUrl:`http://127.0.0.1:${address.port}`},'private-secret');expect(a.availability).toBe('offline');expect(a?.value).toBeNull();expect(JSON.stringify(a)).not.toContain('private-secret');}finally{await new Promise(resolve=>server.close(resolve));}
});
test('capture rejects redirects without forwarding a credential and caps device responses',async()=>{
 let requests=0;const server=createServer((req,res)=>{requests++;if(req.url==='/api/states/sensor.redirect'){res.writeHead(302,{Location:'/api/states/sensor.target'}).end();return;}if(req.url==='/api/states/sensor.large'){res.end('x'.repeat(70000));return;}res.writeHead(403).end('private-secret');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));const address=server.address();if(!address||typeof address==='string')throw Error('No server address');const baseUrl=`http://127.0.0.1:${address.port}`;
 try{
  await expect(captureDevice({...config,baseUrl,entityId:'sensor.redirect'},'private-secret')).rejects.toThrow('unavailable');expect(requests).toBe(1);
  await expect(captureDevice({...config,baseUrl,entityId:'sensor.large'},'private-secret')).rejects.toThrow('64 KiB');
  await expect(captureDevice({...config,baseUrl},'private-secret')).rejects.toThrow('status 403');
  await expect(captureDevice({...config,baseUrl:baseUrl+'/?token=private-secret'},'private-secret')).rejects.toThrow('without credentials');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('impossible calendar dates cannot become recent source timestamps',()=>{
 const a=adaptDevice(config,{entity_id:'sensor.example',state:'72',last_reported:'2026-02-30T12:00:00Z'},'2026-03-02T12:00:01Z');
 expect(a?.observedAt).toBeNull();
});
