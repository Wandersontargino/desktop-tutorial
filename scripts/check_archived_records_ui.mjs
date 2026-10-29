import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {Window} from 'happy-dom';
import {IDBFactory} from 'fake-indexeddb';
const locations=JSON.parse(readFileSync('public/locations-2026.json','utf8')).locations;
const user={id:'archived-test',email:'owner@example.test',name:'Responsável fictício',role:'owner',scope:''};
const records=Array.from({length:6},(_,i)=>({id:'synthetic-'+i,name:i===3?'ANA MÁRCIA FICTÍCIA':'PESSOA FICTÍCIA '+i,title:'080031181384',zone:'72',section:'372',contact:'(91) 99999-0000',mother:'MÃE FICTÍCIA',cpf:'123.456.789-00',rg:'RG FICTÍCIO',birth:'2000-01-02',leadership:i<3?'LIDERANÇA ATIVA':i===5?'OUTRA LIDERANÇA':'LIDERANÇA ARQUIVADA',coordinator:i===5?'OUTRA COORDENAÇÃO':'COORDENAÇÃO FICTÍCIA',notes:'OBSERVAÇÃO PRIVADA FICTÍCIA '+i,source:'<img src=x onerror=alert(1)> FONTE FICTÍCIA',deleted:i>=3,version:1,createdAt:'2026-01-02T12:00:00.000Z',updatedAt:'2026-02-03T12:00:00.000Z'}));
const snapshot={revision:20,records,duplicateReviews:[{id:'dup:synthetic-0|synthetic-3',recordIds:['synthetic-0','synthetic-3'],observation:'DUPLICIDADE FICTÍCIA: conferir documentos.'}]};
const before=JSON.stringify(records);
async function fixture({denied=false,role='owner',extra=0}={}){
 const w=new Window({url:'https://example.test/#/cadastros/arquivados',width:320,height:740,settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}}),db=new IDBFactory();let syncs=0,historyReads=0,delayed=false,release;
 w.document.write(readFileSync('public/index.html','utf8'));const css=w.document.createElement('style');css.textContent=readFileSync('public/platform.css','utf8');w.document.head.append(css);
 Object.defineProperty(w,'crypto',{value:webcrypto});Object.defineProperty(w,'indexedDB',{value:denied?{open(){throw Error('Synthetic denied storage');}}:db});Object.defineProperty(w.navigator,'onLine',{value:true,configurable:true});w.confirm=()=>true;w.scrollTo=()=>{};
 w.Option=function(text='',value=''){const o=w.document.createElement('option');o.textContent=text;o.value=value;return o;};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const person={...user,role,scope:role==='leader'?'LIDERANÇA ARQUIVADA':''},all=[...records,...Array.from({length:extra},(_,i)=>({...records[3],id:'extra-'+i,name:'REGISTRO EXTRA FICTÍCIO '+String(i).padStart(2,'0')}))],visible={...snapshot,records:role==='owner'?all:all.filter(r=>r.leadership===person.scope),duplicateReviews:role==='owner'?snapshot.duplicateReviews:[]};
 w.fetch=async(path,options={})=>{
   if(path==='/api/crm/session')return w.Response.json(options.method==='POST'?{user:person,snapshot:visible}:{user:person,needsSetup:false,integrations:{}});
   if(path==='/locations-2026.json')return w.Response.json({locations});if(path==='/api/crm/members')return w.Response.json({items:[]});
   if(path==='/api/crm/sync'){syncs++;throw Error('Merely viewing archives must not synchronize.');}
   if(path.startsWith('/api/crm/audit?id=')){historyReads++;const id=new URL('https://example.test'+path).searchParams.get('id');assert.ok(visible.records.some(r=>r.id===id));const value={items:[{id:'audit-test',record_id:id,operation:'arquivar',created_at:'2026-02-03T12:00:00.000Z',user_name:'Responsável <fictício>',before:{...records.find(r=>r.id===id),deleted:false},after:records.find(r=>r.id===id)}]};if(delayed)return new Promise(resolve=>release=()=>resolve(w.Response.json(value)));return w.Response.json(value);}
   throw Error('Unexpected request '+path);
 };
 w.PlatformTools={manifests:new Map()};w.eval(readFileSync('public/workspace-pages.js','utf8'));w.eval(readFileSync('public/app.js','utf8').replace('  init();','  window.archivedRouter={state,showWorkspaceView,attachNavigationEvents};'));
 const router=w.archivedRouter;w.WorkspacePages.init({getState:()=>router.state,showView:router.showWorkspaceView,report(){}});router.attachNavigationEvents();router.showWorkspaceView(w.WorkspacePages.route(),false);
 w.eval(readFileSync('dist/client/crm-workspace.js','utf8'));await w.CrmWorkspace.init({state:router.state,storageKey:'empty-archived-test',reloadLists(){},showView:router.showWorkspaceView});
 const $=id=>w.document.getElementById(id);return {w,$,router,get syncs(){return syncs;},get historyReads(){return historyReads;},delay(){delayed=true;},release(){release();}};
}
async function until(f,test,label){for(let i=0;i<240;i++){if(test())return;await new Promise(r=>setTimeout(r,20));}throw Error(label+' / '+f.$('crm-status').textContent);}
async function login(f){f.$('crm-password').value='Senha fictícia segura 2026';f.$('crm-unlock').click();await until(f,()=>f.w.CrmWorkspace.isUnlocked()&&!f.$('crm-unlock').disabled,'Unlock archives');}
{
 const f=await fixture(),{w,$,router}=f;assert.equal(w.WorkspacePages.route(),'archived-records');assert.equal($('crm-central').hidden,true);assert.equal($('crm-archived-count').textContent,'');assert.ok(!$('crm-page-archived').textContent.includes(records[3].name));
 await login(f);assert.equal(router.state.view,'archived-records');assert.equal($('crm-page-archived').hidden,false);assert.equal($('crm-page-records').hidden,true);assert.equal($('workspace-current').textContent,'Cadastros arquivados');assert.equal($('workspace-section-nav').querySelector('[aria-current="page"]').textContent,'Arquivados');
 assert.equal($('crm-archived-items').querySelectorAll('[data-archived-card]').length,3);assert.ok($('crm-archived-count').textContent.startsWith('3 de 3'));assert.ok(!$('crm-archived-items').textContent.includes(records[0].name));assert.equal(f.historyReads,0);assert.equal(f.syncs,0);
 router.showWorkspaceView('lists',false);$('crm-search').value='BUSCA ATIVA SEM RESULTADO';$('crm-leader-filter').value='LIDERANÇA ATIVA';$('crm-status-filter').value='green';router.showWorkspaceView('archived-records',false);assert.ok($('crm-archived-count').textContent.startsWith('3 de 3'));
 $('crm-archived-search').value='ana marcia';$('crm-archived-search').dispatchEvent(new w.Event('input'));assert.equal($('crm-archived-items').querySelectorAll('[data-archived-card]').length,1);
 const card=$('crm-archived-items').querySelector('[data-archived-card]');for(const text of [records[3].mother,records[3].cpf,records[3].rg,records[3].birth,records[3].contact,records[3].notes,records[3].source,snapshot.duplicateReviews[0].observation])assert.ok(card.textContent.includes(text),text);assert.equal(card.querySelector('img'),null);card.open=true;
 card.querySelector('[data-archived-history]').click();await until(f,()=>$('crm-archived-status').textContent.includes('Últimas alterações'),'Protected history');assert.equal(f.historyReads,1);assert.ok($('crm-archived-items').textContent.includes('Antes: Ativo'));assert.ok($('crm-archived-items').textContent.includes('Depois: Arquivado'));assert.equal(f.syncs,0);
 $('crm-archived-clear').click();$('crm-archived-leader').value='OUTRA LIDERANÇA';$('crm-archived-leader').dispatchEvent(new w.Event('change'));assert.equal($('crm-archived-items').querySelectorAll('[data-archived-card]').length,1);assert.ok($('crm-archived-items').textContent.includes(records[5].name));
 $('crm-archived-items').querySelector('[data-archived-reactivate]').click();await until(f,()=>$('crm-review').open,'Reactivation review');assert.equal(w.CrmWorkspace.getOperationalState().pending,1);assert.equal(f.syncs,0);assert.ok($('crm-review-items').textContent.includes('Arquivado'));assert.equal(JSON.stringify(records),before);
 $('crm-discard-review').click();await until(f,()=>!$('crm-review').open,'Discard staged reactivation');assert.equal(w.CrmWorkspace.getOperationalState().pending,0);$('crm-archived-clear').click();assert.ok($('crm-archived-count').textContent.startsWith('3 de 3'));assert.equal(f.syncs,0);
 f.delay();$('crm-archived-items').querySelector('[data-archived-history]').click();await until(f,()=>f.historyReads===2,'Delayed history started');await w.CrmWorkspace.lock();f.release();await new Promise(r=>setTimeout(r,30));assert.equal($('crm-archived-items').children.length,0);assert.equal($('crm-archived-count').textContent,'');assert.equal($('crm-archived-status').textContent,'');assert.equal($('crm-archived-leader').options.length,1);assert.equal($('crm-archived-coordinator').options.length,1);assert.equal($('crm-archived-search').value,'');assert.ok(!$('crm-page-archived').textContent.includes(records[3].name));
 w.happyDOM.abort();await w.close();
}
{
 const f=await fixture({role:'leader'});await login(f);assert.ok(f.$('crm-archived-count').textContent.startsWith('2 de 2'));assert.ok(!f.$('crm-page-archived').textContent.includes(records[5].name));await f.w.CrmWorkspace.lock();f.w.happyDOM.abort();await f.w.close();
}
{
 const f=await fixture({denied:true});await login(f);assert.ok(f.$('crm-archived-count').textContent.startsWith('3 de 3'));assert.ok([...f.$('crm-archived-items').querySelectorAll('[data-archived-reactivate]')].every(b=>b.disabled));assert.ok(!f.$('crm-archived-items').querySelector('[data-archived-history]').disabled);await f.w.CrmWorkspace.lock();f.w.happyDOM.abort();await f.w.close();
}
{
 const f=await fixture({extra:52});await login(f);assert.ok(f.$('crm-archived-count').textContent.startsWith('55 de 55'));assert.equal(f.$('crm-archived-items').querySelectorAll('[data-archived-card]').length,50);f.$('crm-archived-next').click();assert.equal(f.$('crm-archived-items').querySelectorAll('[data-archived-card]').length,5);f.$('crm-archived-search').value='extra-51';f.$('crm-archived-search').dispatchEvent(new f.w.Event('input'));assert.equal(f.$('crm-archived-items').querySelectorAll('[data-archived-card]').length,1);assert.equal(f.$('crm-archived-page').textContent,'Página 1 de 1');assert.equal(f.syncs,0);await f.w.CrmWorkspace.lock();f.w.happyDOM.abort();await f.w.close();
}
console.log('Archived records: direct route/menu, scoped archived-only list, independent filters, complete escaped fields/observations, protected history, staged reactivation without central writes, consultation mode and clearing late history on lock verified.');
