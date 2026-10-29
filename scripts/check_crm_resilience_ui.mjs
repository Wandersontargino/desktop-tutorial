import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {Window} from 'happy-dom';
import {IDBFactory} from 'fake-indexeddb';
import {assess,quality} from '../lib/crm-model.mjs';
const locations=JSON.parse(readFileSync('public/locations-2026.json','utf8')).locations,records=Array.from({length:3},(_,i)=>assess({id:'fixture-'+i,name:'PESSOA FICTICIA '+i,title:'080031181384',zone:'72',section:'372',leadership:'LIDERANCA FICTICIA',coordinator:'COORDENACAO FICTICIA',version:1},locations));
const user={id:'login-test',email:'owner@example.test',name:'Responsável',role:'owner',scope:''},snapshot={revision:20,records,quality:quality(records)};
async function fixture({storage='normal',rejectPassword=false,factory=new IDBFactory()}={}){
  const w=new Window({url:'https://example.test/#/cadastros/registros',width:320,height:740,settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}}),order=[];let online=true,posts=0;
  w.document.write(readFileSync('public/index.html','utf8'));const css=w.document.createElement('style');css.textContent=readFileSync('public/platform.css','utf8');w.document.head.append(css);
  Object.defineProperty(w,'crypto',{value:webcrypto});Object.defineProperty(w.navigator,'onLine',{get:()=>online});w.confirm=()=>false;w.Option=function(text='',value=''){const o=w.document.createElement('option');o.textContent=text;o.value=value;return o;};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  Object.defineProperty(w,'indexedDB',{value:{open(...args){order.push('storage');if(storage==='denied')throw new Error('Storage denied');if(storage==='blocked'){const request={};w.setTimeout(()=>request.onblocked?.(),0);return request;}if(storage==='stalled')return {};const request=factory.open(...args);if(storage==='quota')request.addEventListener('success',()=>{const db=request.result,transaction=db.transaction.bind(db);db.transaction=(names,mode)=>{if(mode==='readwrite')throw new Error('Quota exceeded');return transaction(names,mode);};});return request;}}});
  w.fetch=async(path,options={})=>{let value;if(path==='/api/crm/session'){if(options.method==='POST'){posts++;order.push('authenticate');if(rejectPassword)return w.Response.json({error:'E-mail ou senha não conferem.'},{status:401});value={user,snapshot};}else value={user,needsSetup:false,integrations:{}};}else if(path==='/locations-2026.json')value={locations};else if(path==='/api/crm/members')value={items:[]};else if(path==='/api/crm/records')value=snapshot;else if(path==='/api/crm/duplicates')value={revision:20,groups:[{id:'dup:fixture-0|fixture-1',records:records.slice(0,2),status:'review',active:2,eligible:false,principalId:null,differences:[],blockers:['Conferir fonte ficticia.'],observation:'Revisao pendente.'}],summary:{groups:1,review:1,eligible:0,resolved:0}};else throw Error('Unexpected fetch '+path);return w.Response.json(value);};
  w.PlatformTools={manifests:new Map()};w.scrollTo=()=>{};
  w.eval(readFileSync('public/workspace-pages.js','utf8'));
  w.eval(readFileSync('public/app.js','utf8').replace('  init();','  window.loginRouter={state,showWorkspaceView,attachNavigationEvents};'));
  const router=w.loginRouter;w.WorkspacePages.init({getState:()=>router.state,showView:router.showWorkspaceView,report(){}});router.attachNavigationEvents();router.showWorkspaceView('lists',false);
  w.eval(readFileSync('dist/client/crm-workspace.js','utf8'));await w.CrmWorkspace.init({state:router.state,storageKey:'test-empty',reloadLists(){},showView:router.showWorkspaceView});
  const $=id=>w.document.getElementById(id);return {w,$,order,get posts(){return posts;},offline(){online=false;w.dispatchEvent(new w.Event('offline'));}};
}
async function until(f,test,label){for(let i=0;i<240;i++){if(test())return;await new Promise(r=>setTimeout(r,25));}throw Error(label+' / '+f.$('crm-status').textContent);}
{
 const f=await fixture(),{w,$}=f;$('crm-password').value='Senha fictícia segura 2026';$('crm-unlock').click();await until(f,()=>w.CrmWorkspace.isUnlocked()&&!$('crm-unlock').disabled,'Unlocked fixture');
 w.CrmWorkspace.setPage('duplicates');await until(f,()=>!!$('crm-page-duplicates').querySelector('textarea'),'Duplicate fixture');
 const draftText='OBSERVACAO FICTICIA PRESERVADA NA FALHA';const input=$('crm-page-duplicates').querySelector('textarea');input.value=draftText;input.dispatchEvent(new w.Event('input',{bubbles:true}));
 const originalOpen=w.indexedDB.open;w.indexedDB.open=()=>{throw Error('Synthetic quota failure');};
 const locking=w.CrmWorkspace.lock();assert.equal(w.CrmWorkspace.isUnlocked(),false,'Lock must mask data before waiting for storage.');assert.equal(w.CrmWorkspace.getRecords().length,0);assert.equal($('crm-central').hidden,true);await locking;
 const emergency=w.localStorage.getItem('pa-protected-emergency:'+user.email);assert.ok(emergency);assert.ok(!emergency.includes(draftText));assert.ok($('crm-status').textContent.includes('Base bloqueada'));
 w.indexedDB.open=originalOpen;$('crm-password').value='Senha fictícia segura 2026';$('crm-unlock').click();await until(f,()=>w.CrmWorkspace.isUnlocked()&&!$('crm-unlock').disabled,'Reopen after quota');assert.equal($('crm-recover-copy').hidden,false);
 $('crm-recover-copy').click();$('crm-recovery-password').value='Senha fictícia segura 2026';$('crm-recovery-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(f,()=>$('crm-recovery-status').textContent.includes('1 observação'),'Recover encrypted emergency draft');
 w.CrmWorkspace.setPage('duplicates');await until(f,()=>$('crm-page-duplicates').querySelector('textarea')?.value===draftText,'Recovered note');assert.equal(w.localStorage.getItem('pa-protected-emergency:'+user.email),null);await w.CrmWorkspace.lock();w.happyDOM.abort();await w.close();
}
{
 const f=await fixture(),{w,$}=f;$('crm-password').value='Senha fictícia segura 2026';$('crm-unlock').click();await until(f,()=>w.CrmWorkspace.isUnlocked()&&!$('crm-unlock').disabled,'Expired-session fixture');
 w.indexedDB.open=()=>{throw Error('Synthetic quota failure');};const fetch=w.fetch;w.fetch=(path,options)=>path==='/api/crm/records'?Promise.resolve(w.Response.json({error:'Synthetic expired session'},{status:401})):fetch(path,options);
 await w.CrmWorkspace.refreshCentral();assert.equal(w.CrmWorkspace.isUnlocked(),false);assert.equal(w.CrmWorkspace.getRecords().length,0);assert.equal($('crm-central').hidden,true);w.happyDOM.abort();await w.close();
}
{
 const f=await fixture(),{w,$}=f;$('crm-password').value='Senha fictícia segura 2026';$('crm-unlock').click();await until(f,()=>w.CrmWorkspace.isUnlocked()&&!$('crm-unlock').disabled,'Delayed response fixture');
 const fetch=w.fetch;let release;w.fetch=(path,options)=>path==='/api/crm/records'?new Promise(resolve=>release=()=>resolve(w.Response.json(snapshot))):fetch(path,options);
 const refreshing=w.CrmWorkspace.refreshCentral();await w.CrmWorkspace.lock();release();await refreshing;assert.equal(w.CrmWorkspace.isUnlocked(),false);assert.equal(w.CrmWorkspace.getRecords().length,0);assert.equal($('crm-table-body').children.length,0);w.happyDOM.abort();await w.close();
}
console.log('CRM security UI: immediate lock during storage failure, encrypted emergency draft recovery, expired-session masking and late-response isolation verified.');
