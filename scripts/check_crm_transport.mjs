import assert from 'node:assert/strict';
import {fetchCrmJSON} from '../src/crm-request.mjs';
import {createTabActivity} from '../src/crm-tab-activity.mjs';
import {keepEmergencyCopy,emergencyCopies,clearEmergencyCopy} from '../src/protected-recovery.mjs';
import {seal,unseal,deriveVaultKey,newSalt} from '../public/secure-vault.mjs';

let signal;
await assert.rejects(fetchCrmJSON('records','GET',undefined,{timeout:30,fetchImpl:async(_url,options)=>{signal=options.signal;return {json:()=>new Promise(()=>{})};}}),/demorou para concluir/);
assert.equal(signal.aborted,true,'The deadline must cancel a response whose headers already arrived.');
await assert.rejects(fetchCrmJSON('records','GET',undefined,{timeout:30,fetchImpl:()=>new Promise(()=>{})}),/demorou para concluir/);
await assert.rejects(fetchCrmJSON('records','GET',undefined,{fetchImpl:async()=>({json:async()=>{throw Error('invalid JSON');}})}),/Sessão indisponível/);
const result=await fetchCrmJSON('sync','POST',{operationId:'fixture-operation'},{fetchImpl:async(url,options)=>{assert.equal(url,'/api/crm/sync');assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');assert.equal(JSON.parse(options.body).operationId,'fixture-operation');return {ok:true,json:async()=>({saved:true})};}});assert.equal(result.value.saved,true);

const channels=[];
class Channel{constructor(){channels.push(this);}postMessage(data){for(const channel of channels)if(channel!==this&&!channel.closed)channel.onmessage?.({data});}close(){this.closed=true;}}
let time=100000,activities=0,locks=0;
const first=createTabActivity({getIdentity:()=> 'owner',onActivity(){},onLock(){},Channel,now:()=>time});
const second=createTabActivity({getIdentity:()=> 'owner',onActivity:()=>activities++,onLock:()=>locks++,Channel,now:()=>time});
const other=createTabActivity({getIdentity:()=> 'another-account',onActivity(){throw Error('Another account must be isolated.');},onLock(){throw Error('Another account must be isolated.');},Channel,now:()=>time});
first.activity();first.activity();assert.equal(activities,1);time+=6000;first.activity();assert.equal(activities,2);first.lock('owner');assert.equal(locks,1);
channels[1].onmessage({data:{type:'lock',user:'owner',at:time-60000}});assert.equal(locks,1,'Old messages cannot lock a current session.');first.close();second.close();other.close();

const salt=newSalt(),key=await deriveVaultKey('Senha fictícia segura 2026',salt),privateText='RASCUNHO FICTÍCIO DE EMERGÊNCIA',copy={salt,...await seal({duplicateDrafts:[['dup:a|b',{observation:privateText}]]},key)},values=new Map(),storage={setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k),removeItem:k=>values.delete(k)};
keepEmergencyCopy('fixture@example.test',copy,storage);assert.ok(![...values.values()].join('').includes(privateText));assert.equal((await unseal(emergencyCopies('fixture@example.test',storage)[0],key)).duplicateDrafts[0][1].observation,privateText);
clearEmergencyCopy('fixture@example.test',copy.cipher,storage);assert.equal(emergencyCopies('fixture@example.test',storage).length,0);
const denied={setItem(){throw Error('Quota');},getItem(){throw Error('Denied');}};keepEmergencyCopy('denied@example.test',copy,denied);assert.equal(emergencyCopies('denied@example.test',denied).length,1,'A storage error must not prevent the encrypted emergency copy in memory.');clearEmergencyCopy('denied@example.test',copy.cipher,denied);
console.log('CRM resilience: complete-response deadline, stable request data, cross-tab activity, account isolation and encrypted emergency recovery verified.');
