import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
const html=readFileSync('public/index.html','utf8');
const css=readFileSync('public/styles.css','utf8')+'\n'+readFileSync('public/platform.css','utf8')+'\n'+readFileSync('public/dashboard-theme.css','utf8')+'\n'+readFileSync('public/council.css','utf8');
const app=readFileSync('public/app.js','utf8').replace('  init();','  window.mobileTest={state,showWorkspaceView,attachEvents};');
for(const width of [320,360,390,430,600,650,768,850,851,1024,1440]){
  const w=new Window({width,height:844,settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
  w.document.write(html);const style=w.document.createElement('style');style.textContent=css;w.document.head.append(style);
  w.Option=function(text='',value=''){const o=w.document.createElement('option');o.textContent=text;o.value=value;return o;};w.scrollTo=()=>{};
  w.eval(readFileSync('public/workspace-pages.js','utf8'));w.eval(app);const api=w.mobileTest;w.WorkspacePages.init({showView:api.showWorkspaceView,getState:()=>api.state});api.attachEvents();
  const read=selector=>w.getComputedStyle(w.document.querySelector(selector));
  const complete=w.document.getElementById('complete-report-button');
  assert.equal(w.document.querySelectorAll('#complete-report-button').length,1);
  assert.ok(Number.parseFloat(w.getComputedStyle(complete).minHeight)>=44);
  if(width<=650)assert.equal(w.getComputedStyle(complete).width,'100%');
  const layout=w.document.getElementById('complete-report-organization');
  assert.equal(layout.value,'consolidated');assert.equal(layout.options[1].value,'regions');
  layout.value='regions';layout.dispatchEvent(new w.Event('change'));assert.equal(api.state.completeReportLayout,'regions');
  layout.value='consolidated';layout.dispatchEvent(new w.Event('change'));assert.equal(api.state.completeReportLayout,'consolidated');
  assert.ok(Number.parseFloat(w.getComputedStyle(layout).minHeight)>=44);
  if(width<=650)assert.equal(read('.complete-report-controls').gridTemplateColumns,'minmax(0, 1fr)');
  for(const id of ['report-prepare','report-download','report-close'])assert.ok(Number.parseFloat(w.getComputedStyle(w.document.getElementById(id)).minHeight)>=44);
  if(width<=650)assert.equal(read('.report-options').gridTemplateColumns,'minmax(0, 1fr)');
  assert.equal(w.document.getElementById('summary-pdf-button').hidden,true);
  for(const id of ['print-territory-button','print-xray-button','print-regional-button','print-comparison-button'])assert.equal(w.document.getElementById(id).hidden,true);
  const menu=[...w.document.querySelectorAll('#platform-navigation [data-view]')],cards=[...w.document.querySelectorAll('.app-menu-item[data-view]')],bottom=[...w.document.querySelectorAll('#mobile-app-navigation [data-view]')];
  for(const id of ['ct-council','ct-search','ct-status','ct-pole','ct-school-search','ct-compare-a','ct-compare-b'])assert.ok(Number.parseFloat(w.getComputedStyle(w.document.getElementById(id)).minHeight)>=44);
  if(width<=650)for(const selector of ['.ct-context','.ct-filters','.ct-compare-selects','.ct-school-grid','.ct-source-grid'])assert.equal(read(selector).gridTemplateColumns,'minmax(0, 1fr)');
  for(const id of ['ct-reg-pole','ct-reg-status','ct-reg-search','ct-geo-search','ct-geo-lat','ct-geo-lon','ct-geo-source'])assert.ok(Number.parseFloat(w.getComputedStyle(w.document.getElementById(id)).minHeight)>=44);
  if(width<=650)for(const selector of ['.ct-reg-filters','.ct-geo-layout','.ct-history-metrics'])assert.equal(read(selector).gridTemplateColumns,'minmax(0, 1fr)');
  assert.equal(menu.length,6);assert.equal(cards.length,6);assert.equal(bottom.length,5);
  api.state.regionFilter='r03';api.state.territoryZone='72';api.state.territorySection='372';api.state.office='federal';
  const filters=()=>JSON.stringify([api.state.office,api.state.regionFilter,api.state.territoryZone,api.state.territorySection]);const before=filters();
  w.document.getElementById('header-menu-button').click();assert.equal(api.state.view,'menu');assert.equal(filters(),before);
  assert.equal(w.document.querySelector('.app-menu-panel').classList.contains('is-view-hidden'),false);
  for(const button of [...cards,...bottom]){
    button.click();assert.equal(api.state.view,button.dataset.view);assert.equal(w.document.body.dataset.view,button.dataset.view);assert.equal(filters(),before);
    const selected=menu.filter(b=>b.getAttribute('aria-current')==='page');const area=w.WorkspacePages.pages[button.dataset.view][0];assert.equal(selected.length,area?1:0);if(area)assert.equal(selected[0].dataset.workspaceArea,area);
    for(const node of w.document.querySelectorAll('[data-view-content]'))assert.equal(node.classList.contains('is-view-hidden'),!node.dataset.viewContent.split(' ').includes(button.dataset.view));
    if(cards.includes(button)||width<=850)assert.ok(Number.parseFloat(w.getComputedStyle(button).minHeight)>=44);
  }
  api.showWorkspaceView('home',false);assert.equal(bottom[0].getAttribute('aria-current'),'page');
  assert.equal(read('.table-wrap').overflow,'auto');assert.equal(read('.panel').minWidth,'0');
  if(width<=850){assert.equal(read('main').marginLeft,'0px');assert.equal(read('.site-header').position,'sticky');}
  else {assert.equal(read('main').marginLeft,'220px');assert.equal(read('.site-header').position,'fixed');}
  if(width<=850){assert.equal(read('.platform-navigation').display,'none');assert.equal(read('.mobile-app-navigation').display,'grid');assert.equal(read('.mobile-app-navigation').position,'fixed');assert.equal(read('.header-menu-button').display,'grid');assert.equal(read('.app-menu-list').gridTemplateColumns,'minmax(0, 1fr)');assert.ok(Number.parseFloat(read('footer').paddingBottom.replace(/^calc\(/,''))>80);}
  else {assert.equal(read('.platform-navigation').display,'flex');assert.equal(read('.mobile-app-navigation').display,'none');assert.equal(read('.header-menu-button').display,'none');assert.ok(read('.app-menu-list').gridTemplateColumns.includes('repeat(2'));}
  assert.equal(read('.pair-remainder-metrics').gridTemplateColumns,width<=650?'minmax(0, 1fr)':'repeat(2, minmax(0, 1fr))');
  for(const id of ['pair-estadual-municipal-pdf','pair-federal-municipal-pdf'])assert.ok(Number.parseFloat(w.getComputedStyle(w.document.getElementById(id)).minHeight)>=44);
  if(width<=650)assert.equal(read('.search-results').position,'absolute');
  if(width<=600)assert.equal(read('.selection-grid').gridTemplateColumns,'minmax(0, 1fr)');
  if(width<=380)for(const selector of ['.candidate-metrics','.xray-metrics','.regional-metrics','.analysis-metrics'])assert.equal(read(selector).gridTemplateColumns,'minmax(0, 1fr)');
  for(const id of ['archive-year','archive-office','archive-city','archive-region','archive-zone','archive-mode','archive-search','archive-entity','archive-previous-year'])assert.ok(Number.parseFloat(w.getComputedStyle(w.document.getElementById(id)).minHeight)>=44);
  if(width<=600)assert.equal(read('.archive-filters').gridTemplateColumns,'minmax(0, 1fr)');
  if(width<=850)assert.equal(read('.archive-dashboard').gridTemplateColumns,'minmax(0, 1fr)');
  if(width<=380)assert.equal(read('.archive-metrics').gridTemplateColumns,'minmax(0, 1fr)');
  for(const id of ['municipality-picker-search','municipality-picker-apply','municipality-picker-clear','municipality-selection-city','municipality-selection-zone','municipality-selection-place','municipality-selection-pdf','municipality-selection-csv'])assert.ok(Number.parseFloat(w.getComputedStyle(w.document.getElementById(id)).minHeight)>=44);
  if(width<=600){assert.equal(read('#municipality-picker-options').gridTemplateColumns,'minmax(0, 1fr)');assert.equal(read('.municipality-selection-filters').gridTemplateColumns,'minmax(0, 1fr)');assert.equal(read('.municipality-selection-metrics').gridTemplateColumns,'minmax(0, 1fr)');}
  assert.equal(read('.municipality-selection-cards').minWidth,'0');
  // The same classes used by the generated CRM interface, with a deliberately wide table.
  const fixture=w.document.createElement('section');fixture.innerHTML='<div class="table-scroll"><table class="crm-table"><tr><td>Conteúdo longo</td></tr></table></div><label class="field" hidden><span>Oculto</span><input></label>';w.document.body.append(fixture);
  assert.equal(w.getComputedStyle(fixture.querySelector('.table-scroll')).overflowX,'auto');assert.equal(w.getComputedStyle(fixture.querySelector('.table-scroll')).maxWidth,'100%');assert.equal(w.getComputedStyle(fixture.querySelector('.crm-table')).minWidth,'1000px');assert.equal(w.getComputedStyle(fixture.querySelector('[hidden]')).display,'none');
  await w.close();
}
console.log('Responsive checks passed: full card menu, five bottom shortcuts, six areas and contextual pages, synchronized active buttons, preserved filters, 320–1440 CSS widths, bottom content clearance, confined tables, and desktop sidebar. DOM/CSS emulation; no physical-device visual test.');
