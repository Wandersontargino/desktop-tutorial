import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import {createMaintenanceFixture,fixtureOwner} from './fixtures/maintenance-fixture.mjs';
const f=createMaintenanceFixture(),password='Senha fictícia de mobile 2026',salt='native-fixture';
f.sqlite.prepare('UPDATE crm_users SET password_hash=?,salt=? WHERE id=?').run(pbkdf2Sync(password,salt,600000,32,'sha256').toString('hex'),salt,fixtureOwner.id);
// The same production route, compiled with empty private import modules.
await (await import('./build-test-worker.mjs')).buildTestWorker('.sites-runtime/mobile-test-worker.mjs');
const worker=(await import('../.sites-runtime/mobile-test-worker.mjs')).default,env={DB:f.D1,BUCKET:f.bucket};
const identity={'oai-authenticated-user-id':fixtureOwner.id,'oai-authenticated-user-email':fixtureOwner.email};let seq=0;
async function call(method,args,headers=identity){const response=await worker.fetch(new Request('https://example.test/mcp',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({jsonrpc:'2.0',id:++seq,method,params:method==='tools/call'?{name:'platform_mobile_api',arguments:args}:undefined})}),env);const value=await response.json();return {status:response.status,value,data:value.result?.content?.[0]?JSON.parse(value.result.content[0].text):null};}
assert.equal((await call('server/discover',null,{})).value.result.supportedVersions[0],'2026-07-28');
assert.equal((await call('tools/list',null,{})).value.result.tools.length,1);
assert.equal((await call('tools/call',{path:'records',method:'GET'},{})).status,401);
assert.equal((await call('tools/call',{path:'records',method:'GET'})).data.status,401);
const login=await call('tools/call',{path:'session',method:'POST',payload:{email:fixtureOwner.email,password}});assert.equal(login.data.status,200);assert.match(login.data.session,/^[a-f0-9]{64}$/);assert.equal(login.data.body.snapshot.records.length,4);assert.ok(!JSON.stringify(login.data.body).includes('password_hash'));
const session=login.data.session,records=await call('tools/call',{path:'records',method:'GET',session});assert.equal(records.data.body.records.length,4);
assert.equal((await call('tools/call',{path:'https://bad.test',method:'GET',session})).data.status,400);
assert.equal((await call('tools/call',{path:'../security',method:'POST',session,payload:{}})).data.status,400);
assert.equal((await call('tools/call',{path:'records',method:'GET',session},{'oai-authenticated-user-id':'fixture-other','oai-authenticated-user-email':'other@example.test'})).data.status,401);
const changed={...records.data.body.records[0],notes:'Conferência fictícia no aplicativo.'},operationId='mobile-fixture-sync-001';
const apply=await call('tools/call',{path:'sync',method:'POST',session,payload:{revision:1,operationId,changes:[changed]}});assert.equal(apply.data.status,200);assert.equal(apply.data.body.snapshot.revision,2);
assert.equal((await call('tools/call',{path:'sync',method:'POST',session,payload:{revision:1,operationId,changes:[changed]}})).data.status,200);
assert.equal((await call('tools/call',{path:'sync',method:'POST',session,payload:{revision:1,operationId:'mobile-fixture-stale-001',changes:[changed]}})).data.status,409);
assert.equal((await call('tools/call',{path:'session',method:'DELETE',session,payload:{}})).data.session,'');assert.equal((await call('tools/call',{path:'records',method:'GET',session})).data.status,401);
f.close();console.log('Mobile transport: private identity plus base password, scoped sessions, allowed operations, no credential fields, idempotence, stale revision and device logout verified with synthetic data.');
