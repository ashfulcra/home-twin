import {createServer} from 'node:http';import {readFileSync,lstatSync} from 'node:fs';import {timingSafeEqual} from 'node:crypto';
import {runAccessWorkflow} from './access-workflow.mjs';
const configPath=process.argv[2];const st=lstatSync(configPath);if(st.isSymbolicLink()||!st.isFile()||(st.mode&0o077)||st.size>16384)throw Error('Private bounded service configuration required');
const config=JSON.parse(readFileSync(configPath,'utf8'));if(typeof config.key!=='string'||config.key.length<40||!Array.isArray(config.homes)||config.homes.length>20)throw Error('Private access service configuration invalid');
const expected=Buffer.from('Bearer '+config.key);const send=(r,status,value)=>{r.writeHead(status,{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});r.end(JSON.stringify(value));};
const server=createServer(async(req,res)=>{
 if(req.url==='/health'&&req.method==='GET'){send(res,200,{status:'ready'});return;}
 const auth=Buffer.from(req.headers.authorization??'');
 if(req.method!=='POST'||req.url!=='/'||auth.length!==expected.length||!timingSafeEqual(auth,expected)){send(res,403,{message:'Access denied'});return;}
 try{if(Number(req.headers['content-length']??0)>20000)throw Error();let length=0,text='';for await(const chunk of req){length+=chunk.length;if(length>20000)throw Error();text+=chunk.toString();}const input=JSON.parse(text);const result=await runAccessWorkflow(config,input);send(res,200,result);}
 catch{/* No credentials, source texts or private request codes in logs/responses. */send(res,409,{message:'Access operation is unconfirmed. Retry the same operation or inspect its private journal.'});}
});
server.requestTimeout=120000;server.headersTimeout=15000;server.listen(config.port??6193,'127.0.0.1',()=>process.stdout.write('Home access service ready on loopback\n'));
