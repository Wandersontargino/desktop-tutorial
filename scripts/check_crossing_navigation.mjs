import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
const w=new Window({url:'https://example.test/#/cruzamentos/central',width:390,height:844,settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});w.document.write(readFileSync('public/index.html','utf8'));w.scrollTo=()=>{};let activations=0,reports=0;const aliases=[];
w.CrossingHub={fromLegacy:view=>aliases.push(view),activate:()=>activations++,report:()=>reports++};w.eval(readFileSync('public/workspace-pages.js','utf8'));
w.eval(readFileSync('public/app.js','utf8').replace('  init();','  window.__centralNav={state,showWorkspaceView,attachEvents,printWorkspace};'));
const api=w.__centralNav;w.WorkspacePages.init({getState:()=>api.state,showView:api.showWorkspaceView});api.attachEvents();
assert.equal(w.WorkspacePages.route(),'paired');
for(const source of ['paired','comparison','analysis','partnership']){api.showWorkspaceView(source,false);assert.equal(api.state.view,'paired');assert.equal(w.location.hash,'#/cruzamentos/central');assert.equal(w.document.getElementById('crossing-hub').classList.contains('is-view-hidden'),false);assert.equal(w.document.getElementById('legacy-paired-panel').hidden,true);assert.equal(w.document.getElementById('workspace-current').textContent,'Central de cruzamentos');assert.equal(w.document.getElementById('workspace-section-nav').querySelectorAll('button').length,1);}
assert.deepEqual(aliases,['comparison','analysis','partnership']);assert.equal(activations,4);await api.printWorkspace();assert.equal(reports,1,'The main report button must use the central report, even without the old single candidate.');
for(const hash of ['/resultados/comparar','/cruzamentos/candidato','/cruzamentos/lideranca','/cruzamentos/votacoes']){w.history.replaceState({},'','#'+hash);api.showWorkspaceView(w.WorkspacePages.route(),false);assert.equal(api.state.view,'paired');assert.equal(w.location.hash,'#/cruzamentos/central');}
const ids=[...w.document.querySelectorAll('[id]')].map(n=>n.id);assert.equal(ids.length,new Set(ids).size);
await w.close();console.log('Central navigation passed: every comparison entry and old link reaches one page, single crossing navigation, protected legacy panel and shared report action.');
