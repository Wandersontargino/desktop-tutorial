import {createServer} from 'node:https';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pbkdf2Sync} from 'node:crypto';
import {buildTestWorker} from './build-test-worker.mjs';
import {createMaintenanceFixture} from './fixtures/maintenance-fixture.mjs';
const directory=resolve('.sites-runtime/e2e-tls');mkdirSync(directory,{recursive:true});
if(!existsSync(directory+'/cert.pem'))execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',directory+'/key.pem','-out',directory+'/cert.pem','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
const workerPath=await buildTestWorker(),worker=(await import(new URL('../'+workerPath,import.meta.url))).default;
const password='Senha fictícia E2E 2026',salt='synthetic-e2e-salt',hash=pbkdf2Sync(password,salt,600000,32,'sha256').toString('hex');
let fixture;
function reset(){fixture?.close();fixture=createMaintenanceFixture();fixture.sqlite.prepare('UPDATE crm_users SET password_hash=?,salt=?').run(hash,salt);}
reset();
const root=resolve('dist/client'),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.gz':'application/gzip','.bcmap':'application/octet-stream','.pfb':'application/octet-stream','.ttf':'font/ttf'};
const ASSETS={async fetch(request){let path=new URL(request.url).pathname;if(path==='/')path='/index.html';const full=resolve(root,'.'+path);if(!full.startsWith(root+'/')||!existsSync(full))return new Response('Not found',{status:404});return new Response(readFileSync(full),{headers:{'Content-Type':types[extname(full)]||'application/octet-stream','Cache-Control':'no-store'}});}};
const server=createServer({key:readFileSync(directory+'/key.pem'),cert:readFileSync(directory+'/cert.pem')},async(incoming,outgoing)=>{
  try{
    const url='https://localhost:4173'+incoming.url;
    if(incoming.url==='/__test/ready'){outgoing.writeHead(200,{'Content-Type':'text/plain'});return outgoing.end('Synthetic test server');}
    if(incoming.url==='/__test/reset'&&incoming.method==='POST'){reset();outgoing.writeHead(200,{'Content-Type':'application/json'});return outgoing.end('{"synthetic":true}');}
    const role=incoming.headers['x-fixture-role']==='leader'?'leader':'owner',identity=role==='owner'?{id:'fixture-owner',email:'owner@example.test'}:{id:'fixture-leader',email:'leader@example.test'},headers=new Headers();for(const [key,value]of Object.entries(incoming.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
    headers.set('oai-authenticated-user-id',identity.id);headers.set('oai-authenticated-user-email',identity.email);
    const chunks=[];for await(const part of incoming)chunks.push(part);const request=new Request(url,{method:incoming.method,headers,body:['GET','HEAD'].includes(incoming.method)?undefined:Buffer.concat(chunks)});
    const tasks=[],response=await worker.fetch(request,{DB:fixture.D1,BUCKET:fixture.bucket,ASSETS,PA_AUTOMATIC_BACKUP_KEY:'1f'.repeat(32),PA_PRIVATE_BACKUP_UPDATER:'enabled'},{waitUntil:task=>tasks.push(task)});
    outgoing.writeHead(response.status,Object.fromEntries(response.headers));outgoing.end(Buffer.from(await response.arrayBuffer()));await Promise.allSettled(tasks);
  }catch{outgoing.writeHead(500,{'Content-Type':'application/json'});outgoing.end('{"error":"Synthetic test server failed"}');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Synthetic browser-test server: https://localhost:4173'));
const close=()=>server.close(()=>{fixture.close();process.exit(0);});process.on('SIGTERM',close);process.on('SIGINT',close);
