import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {Window} from 'happy-dom';
import {initDuplicateRecords} from '../src/duplicate-records-view.mjs';
const w=new Window({url:'https://example.test'});
Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
w.document.body.innerHTML='<section id="view"></section>';
const container=w.document.querySelector('#view'),$=id=>container.querySelector('#crm-duplicates-'+id);
let state={unlocked:true,owner:true,canEdit:true,canDraft:true,dirty:false},drafts=new Map(),stored=[],postCalls=[],commits=0,persistenceFailure=false,mode='',held=null;
const group={id:'dup:first|second',records:[{id:'first',name:'PESSOA FICTÍCIA',version:1},{id:'second',name:'PESSOA FICTÍCIA',version:1}],status:'review',eligible:false,active:2,principalId:null,differences:[{field:'title',label:'Título'}],blockers:['Dados divergentes: Título.'],observation:'Conferir identidade.',review:null};
let central={revision:1,groups:[group],summary:{groups:1,review:1,eligible:0,resolved:0}};
const operations=new Map();
const view=initDuplicateRecords({container,getState:()=>state,getDrafts:()=>drafts,setDraft:(id,draft)=>draft?drafts.set(id,draft):drafts.delete(id),persistDrafts:async()=>{if(persistenceFailure)throw Error('Cópia indisponível');stored=structuredClone([...drafts]);},setBusy:busy=>{state.canEdit=!busy;},prepareBackup:async()=>{throw Error('Notes do not archive records.');},acceptSnapshot:async()=>{},openRecord:()=>{},request:async(path,method='GET',input)=>{
  if(method==='GET')return structuredClone(central);
  postCalls.push(structuredClone(input));if(held)await held;
  if(mode==='auth'){mode='';state.unlocked=false;view.clear();drafts=new Map();throw Object.assign(Error('Entre novamente.'),{status:401});}
  if(mode==='before'){mode='';throw Object.assign(Error('Conexão interrompida'),{status:503});}
  if(operations.has(input.operationId))return structuredClone(operations.get(input.operationId));
  if(input.revision!==central.revision)throw Object.assign(Error('A base mudou.'),{status:409});
  group.observation=input.observation;group.review={observation:input.observation,updatedBy:'Responsável de teste',updatedAt:new Date().toISOString()};central.revision++;commits++;
  const result={groups:1,archived:0,snapshot:{revision:central.revision},duplicates:structuredClone(central)};operations.set(input.operationId,result);
  if(mode==='after'){mode='';throw Error('Resposta perdida depois da gravação');}
  return result;
}});
const event=type=>new w.Event(type,{bubbles:true,cancelable:true});
async function until(check,label){for(let i=0;i<200;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Draft UI timeout: '+label+' / '+$('status').textContent);}
function typeNote(text){const input=container.querySelector('textarea');input.value=text;input.dispatchEvent(event('input'));}
function submit(){container.querySelector('[data-duplicate-note]').dispatchEvent(event('submit'));}
await view.open();
typeNote('Rascunho fictício protegido');view.refresh();assert.equal(container.querySelector('textarea').value,'Rascunho fictício protegido','Other renders must retain the text being typed.');assert.equal(container.querySelector('.crm-duplicate-note').open,true);
await until(()=>stored.length===1,'debounced persistence');assert.equal(stored[0][1].observation,'Rascunho fictício protegido');
state.unlocked=false;view.clear();assert.equal(container.querySelectorAll('textarea').length,0);assert.ok(!container.textContent.includes('Rascunho fictício protegido'));drafts=new Map(structuredClone(stored));state.unlocked=true;await view.open();assert.equal(container.querySelector('textarea').value,'Rascunho fictício protegido');
mode='before';submit();await until(()=>$('status').textContent.includes('rascunho protegido'),'interrupted submission');const firstOperation=postCalls.at(-1).operationId;assert.equal(commits,0);assert.equal(stored[0][1].operation.operationId,firstOperation);
state.unlocked=false;view.clear();drafts=new Map(structuredClone(stored));state.unlocked=true;await view.open();$('resume').click();await until(()=>drafts.size===0&&$('status').textContent.includes('confirmada(s)'),'resume after relogin');assert.equal(commits,1);assert.equal(postCalls.at(-1).operationId,firstOperation,'Retries must retain the same operation ID.');assert.equal(stored.length,0);
typeNote('Texto gravado com resposta perdida');mode='after';submit();await until(()=>$('status').textContent.includes('rascunho protegido'),'uncertain server response');assert.equal(commits,2);const callsBeforeResume=postCalls.length;$('resume').click();await until(()=>drafts.size===0&&$('status').textContent.includes('confirmada(s)'),'confirm committed response');assert.equal(postCalls.length,callsBeforeResume,'The central saved observation proves completion without another write.');assert.equal(commits,2);
typeNote('Texto preservado na expiração da sessão');mode='auth';submit();await until(()=>!state.unlocked,'session revoked during post');assert.equal(container.querySelectorAll('textarea').length,0);assert.equal(stored[0][1].observation,'Texto preservado na expiração da sessão');const revokedOperation=stored[0][1].operation.operationId;
drafts=new Map(structuredClone(stored));state.unlocked=true;await view.open();$('resume').click();await until(()=>drafts.size===0&&$('status').textContent.includes('confirmada(s)'),'resume after session revocation');assert.equal(postCalls.at(-1).operationId,revokedOperation);assert.equal(commits,3);
typeNote('Meu rascunho concorrente');group.observation='Observação central escrita por outra pessoa';group.review={observation:group.observation,updatedBy:'Outro responsável'};central.revision++;$('resume').click();await until(()=>$('status').textContent.includes('comparação'),'central conflict');assert.equal(drafts.size,1);assert.equal(group.observation,'Observação central escrita por outra pessoa');assert.equal(container.querySelector('textarea').value,'Meu rascunho concorrente');assert.ok(container.querySelector('.crm-duplicate-observation').textContent.includes('observação(ões) pendente'));
submit();await until(()=>drafts.size===0&&$('status').textContent.includes('Observação salva'),'explicit reviewed save');assert.equal(group.observation,'Meu rascunho concorrente');
typeNote('Texto com falha na cópia');persistenceFailure=true;const before=postCalls.length;submit();await until(()=>$('status').textContent.includes('envio não foi iniciado'),'storage failure');assert.equal(postCalls.length,before);assert.equal(drafts.size,1);persistenceFailure=false;
let release;held=new Promise(resolve=>release=resolve);submit();await until(()=>postCalls.length>before,'first pending post');submit();assert.equal(postCalls.length,before+1,'Repeated clicks during a save must not start another request.');release();await until(()=>drafts.size===0&&$('status').textContent.includes('Observação salva'),'single in-flight request');held=null;
typeNote('Rascunho privado');await until(()=>stored.length===1,'private draft');state.unlocked=false;state.owner=false;view.clear();assert.ok(!container.textContent.includes('Rascunho privado'));assert.equal($('resume').disabled,true);
await w.close();console.log('Duplicate drafts passed: typing, protected persistence callback, relogin recovery, stable retries, lost-response confirmation, central conflict, explicit revision, storage-failure gate, single in-flight save and privacy clearing.');
