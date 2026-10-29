import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
const w=new Window({url:'https://example.test/#/cadastros/distribuicao',width:390,height:844,settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
w.document.write(readFileSync('public/index.html','utf8'));w.scrollTo=()=>{};const css=w.document.createElement('style');css.textContent=readFileSync('public/styles.css','utf8')+'\n'+readFileSync('public/platform.css','utf8');w.document.head.append(css);
w.Option=function(text='',value=''){const o=w.document.createElement('option');o.textContent=text;o.value=value;return o;};
w.eval(readFileSync('public/workspace-pages.js','utf8'));
w.eval(readFileSync('public/app.js','utf8').replace('  init();','  window.pageTest={state,showWorkspaceView,attachEvents};'));
const {state,showWorkspaceView,attachEvents}=w.pageTest,$=id=>w.document.getElementById(id);
let unlocked=false,privateReports=0,candidateReports=0,privatePage='';
w.CrmWorkspace={getReportContext:()=>unlocked?{leadership:'LIDERANÇA <img src=x>',municipality:'ANANINDEUA'}:null,setPage:view=>privatePage=view,isUnlocked:()=>unlocked,openRegistrationReport:()=>{if(!unlocked){showWorkspaceView('lists');return false;}privateReports++;return true;}};
w.WorkspacePages.init({showView:showWorkspaceView,getState:()=>state,report:()=>candidateReports++,toast:()=>{}});attachEvents();
assert.equal(w.WorkspacePages.route(),'distribution');showWorkspaceView(w.WorkspacePages.route(),false);
assert.equal(state.view,'distribution');assert.equal(privatePage,'distribution');assert.equal(w.document.body.dataset.workspaceArea,'cadastros');
assert.equal(w.document.querySelectorAll('#platform-navigation [data-view]').length,6);
assert.equal(w.document.querySelectorAll('.app-menu-item').length,6);
assert.equal(w.document.querySelector('#workspace-management-tools .app-access-toolbar')!==null,true);
// The body has data-view for page styling; it is not a navigation control.
const form=w.document.createElement('form');form.innerHTML='<input type="checkbox" id="ordinary-checkbox"><button id="ordinary-submit" type="submit"><span>Enviar formulário</span></button>';w.document.body.append(form);let submitted=0;form.addEventListener('submit',e=>{e.preventDefault();submitted++;});
$('ordinary-checkbox').click();assert.equal($('ordinary-checkbox').checked,true,'Navigation must preserve native checkbox behavior.');
$('ordinary-submit').click();assert.equal(submitted,1,'Navigation must not cancel ordinary form submissions.');
const plainClick=new w.MouseEvent('click',{bubbles:true,cancelable:true});$('ordinary-submit').querySelector('span').dispatchEvent(plainClick);assert.equal(plainClick.defaultPrevented,false,'Clicks inside ordinary controls must not navigate via body[data-view].');form.remove();

state.territoryZone='72';state.territorySection='177';state.regionFilter='r03';state.analysisZone='72';
const snapshot=()=>JSON.stringify([state.territoryZone,state.territorySection,state.regionFilter,state.analysisZone,state.office,state.lists]);const before=snapshot();
for(const view of Object.keys(w.WorkspacePages.pages)){
  showWorkspaceView(view,false);assert.equal(state.view,view);assert.equal(snapshot(),before,'Navigation must not edit filters or records.');
  assert.equal(w.location.hash,'#/'+w.WorkspacePages.pages[view][1]);
  const active=[...w.document.querySelectorAll('#platform-navigation [aria-current="page"]')];assert.equal(active.length,view==='menu'?0:1);
  if(active.length)assert.equal(active[0].dataset.workspaceArea,w.WorkspacePages.pages[view][0]);
}
showWorkspaceView('overview',false);
$('workspace-detail-nav').querySelector('[data-view="xray"]').click();assert.equal(state.view,'xray');
assert.equal($('workspace-section-nav').querySelector('[aria-current="page"]').textContent,'Candidato');
showWorkspaceView('territory',false);$('workspace-detail-nav').querySelector('[data-view="map"]').click();assert.equal(state.view,'map');
showWorkspaceView('reports',false);w.document.querySelector('[data-workspace-action="registrations"]').click();assert.equal(privateReports,0);assert.equal(state.view,'lists');
unlocked=true;showWorkspaceView('reports',false);w.document.querySelector('[data-workspace-action="registrations"]').click();assert.equal(privateReports,1);assert.equal(state.view,'reports');
w.document.querySelector('[data-workspace-action="municipal"]').click();assert.equal(privateReports,2);let batchReports=0;w.CrmWorkspace.openLeadershipPendenciesReport=()=>{batchReports++;return true;};w.document.querySelector('[data-workspace-action="pendencies"]').click();assert.equal(batchReports,1);assert.ok($('workspace-action-status').textContent.includes('nova página'));
assert.ok($('workspace-report-scope').textContent.includes('LIDERANÇA <img src=x>'));assert.equal($('workspace-report-scope').querySelector('img'),null);unlocked=false;w.document.dispatchEvent(new w.Event('crm:state-change'));assert.ok(!$('workspace-report-scope').textContent.includes('LIDERANÇA'));unlocked=true;

w.document.querySelector('[data-workspace-action="candidate"]').click();assert.equal(state.view,'overview');assert.equal(candidateReports,0,'No PDF without a selected candidate.');
state.candidate=['fictitious','12345','EXEMPLO'];showWorkspaceView('reports',false);w.document.querySelector('[data-workspace-action="candidate"]').click();assert.equal(candidateReports,1);
showWorkspaceView('lists',false);const length=w.history.length;
w.history.replaceState({},'','#/cruzamentos/lideranca');w.dispatchEvent(new w.PopStateEvent('popstate'));
assert.equal(state.view,'partnership');assert.equal(privatePage,'partnership');assert.equal(w.history.length,length,'Back/forward must not create extra history entries.');
w.history.replaceState({},'','#cadastro=invitation-token');showWorkspaceView('lists',false);assert.equal(w.location.hash,'#cadastro=invitation-token','Invitation token must survive route rendering.');
unlocked=false;showWorkspaceView('analysis',false);w.document.body.classList.add('crm-locked');assert.equal(w.getComputedStyle($('analise')).display,'none');assert.notEqual(w.getComputedStyle($('workspace-analysis-locked')).display,'none');unlocked=true;w.document.dispatchEvent(new w.Event('crm:state-change'));w.document.body.classList.remove('crm-locked');assert.equal($('workspace-analysis-locked').hidden,true);
const ids=[...w.document.querySelectorAll('[id]')].map(n=>n.id);assert.equal(ids.length,new Set(ids).size,'Controls must not be duplicated across pages.');
await w.close();console.log('Workspace pages passed: six areas, all contextual pages, direct routes, dynamic navigation, active parents, history without loops, invitation preservation, single controls, unchanged data/filters and protected report actions.');
