import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {Window} from 'happy-dom';
import {indexedDB} from 'fake-indexeddb';
import {registrationDistribution,registrationDistributionReport,registrationDistributionCSV} from '../lib/registration-distribution.mjs';
import {assessRecords,quality} from '../lib/crm-model.mjs';
import {twentyRecords,reportLocations} from './fixtures/registration-report.mjs';
import PDF from '../public/report-pdf.js';
const thousand=Array.from({length:1000},(_,i)=>({id:'r'+i,zone:i<500?'072':i<800?'43':i<950?'107':'',section:i%2?'1':'2',title:'same-title',ready:false}));
const model=registrationDistribution(thousand);
assert.equal(model.total,1000);assert.deepEqual(model.zones.map(r=>[r.zone,r.count,r.share]),[['043',300,.3],['072',500,.5],['107',150,.15],['Não informada',50,.05]]);
assert.equal(model.sections.reduce((n,r)=>n+r.count,0),1000);
assert.equal(registrationDistribution([...thousand,thousand[0],{id:'archived',zone:'72',deleted:true}]).total,1000);
assert.equal(registrationDistribution([{id:'archived',zone:'72',deleted:true}],{archived:true}).total,1);
const malformed=registrationDistribution([{id:'1',zone:'abc',section:'99999'},{id:'2',zone:'0',section:''},{id:'3',zone:'00072',section:'0001'}]);
assert.equal(malformed.invalidZone,2);assert.equal(malformed.invalidSection,1);assert.equal(malformed.missingSection,1);assert.equal(malformed.knownZones,1);
assert.ok(PDF.inspect(PDF.build(registrationDistributionReport({records:thousand}).report)).pages>0);
assert.ok(registrationDistributionCSV({records:thousand}).includes('"ZONA";"072";"";"";"500";"50,0%"'));
const user={id:'summary-owner',email:'summary@example.test',name:'Teste',role:'owner',scope:''};
const fixture=twentyRecords().slice(0,6).map((r,i)=>({...r,id:'ui-'+i,zone:i<3?'72':i===3?'43':i===4?'107':'',section:i<2?'372':i===2?'373':'1',leadership:i<4?'GRUPO A':'GRUPO B'}));
const municipalLocations={'72|372':[{city:'ANANINDEUA',cityCode:'4154',place:'ESCOLA A',neighborhood:'BAIRRO A'}],'72|373':[{city:'ANANINDEUA',cityCode:'4154',place:'ESCOLA B',neighborhood:'BAIRRO B'}],'43|1':[{city:'MUNICÍPIO B',cityCode:'2',place:'ESCOLA EXTERNA A',neighborhood:'BAIRRO EXTERNO'}],'107|1':[{city:'MUNICÍPIO B',cityCode:'2',place:'ESCOLA EXTERNA B',neighborhood:'BAIRRO EXTERNO'}]};
const records=assessRecords([...fixture,{...fixture[0],id:'archived',deleted:true}],municipalLocations),snapshot={revision:1,records,quality:quality(records)};
for(const width of [360,1440]){
  const w=new Window({url:'https://example.test',width,height:844,settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
  Object.defineProperty(w,'crypto',{value:webcrypto});Object.defineProperty(w,'indexedDB',{value:indexedDB});w.confirm=()=>true;w.scrollTo=()=>{};
  w.Option=function(text='',value=''){const o=w.document.createElement('option');o.textContent=text;o.value=value;return o;};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.document.write(readFileSync('public/index.html','utf8'));
  const style=w.document.createElement('style');style.textContent=readFileSync('public/styles.css','utf8')+'\n'+readFileSync('public/platform.css','utf8');w.document.head.append(style);
  let downloaded,writes=0;
  w.fetch=async(input,options={})=>{const path=new URL(input,'https://example.test').pathname;let value;
    if(path==='/api/crm/session')value=options.method==='POST'?{user,snapshot}:{user,needsSetup:false,integrations:{}};
    else if(path==='/api/crm/members')value={items:[user]};
    else if(path==='/api/crm/records')value=snapshot;
    else if(path==='/locations-2026.json')value={locations:municipalLocations};
    else{writes++;throw new Error('Unexpected route '+path);}
    return new w.Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  };
  w.ReportPDF={...PDF,downloadBytes:(bytes,filename)=>downloaded={bytes,filename}};
  for(const file of ['searchable-select','report-center'])w.eval(readFileSync('public/'+file+'.js','utf8'));
  w.eval(readFileSync('dist/client/crm-workspace.js','utf8'));
  w.eval(readFileSync('public/app.js','utf8').replace('  init();','  window.summaryTest={state,renderLists,renderAnalysis,scopeRecords,scopeLabel,attachEvents,showWorkspaceView};'));
  const app=w.summaryTest,$=id=>w.document.getElementById(id),event=type=>new w.Event(type,{bubbles:true,cancelable:true});app.attachEvents();
  await w.CrmWorkspace.init({state:app.state,storageKey:'summary-test',showView:app.showWorkspaceView,reloadLists:lists=>{app.state.lists=lists;app.renderLists();if(app.state.view==='analysis')app.renderAnalysis();},getRegistrationSummary:()=>({records:app.scopeRecords(),label:app.scopeLabel(),filterLabel:app.state.analysisZone?'Zona '+app.state.analysisZone:'Todas as zonas'})});
  async function until(test,label){for(let i=0;i<180;i++){if(test())return;await new Promise(r=>setTimeout(r,20));}throw new Error(label+' / '+$('crm-status').textContent);}
  const total=id=>$(id).querySelector('.metric-card strong')?.textContent;
  assert.equal($('crm-registration-summary').hidden,true);assert.equal($('analysis-registration-summary').hidden,true);
  $('crm-password').value='Senha fictícia segura 2026';$('crm-auth').dispatchEvent(event('submit'));await until(()=>w.CrmWorkspace.isUnlocked()&&!$('crm-unlock').disabled,'unlock');
  assert.equal(total('crm-registration-summary'),'3');
  assert.ok($('crm-registration-summary').querySelector('.registration-municipality-banner').textContent.includes('ANANINDEUA'));assert.equal($('crm-registration-summary').querySelector('[data-other-total]').textContent,'2');assert.equal($('crm-registration-summary').querySelector('[data-unknown-total]').textContent,'1');
  const panel=$('crm-registration-summary');assert.equal(panel.querySelectorAll('[data-territory-filter]').length,6);assert.ok(panel.querySelector('.donut-chart'));assert.ok(panel.querySelector('[data-territory-map]'));assert.ok(panel.textContent.includes('Cadastros por bairro'));assert.ok(panel.textContent.includes('Locais de votação'));
  panel.querySelector('[data-territory-external]').click();assert.equal(total('crm-registration-summary'),'3');assert.ok(panel.querySelector('.registration-other-details').textContent.includes('Consulta externa: MUNICÍPIO B'));assert.ok(!panel.querySelector('.registration-territory-people tbody').textContent.includes('ESCOLA EXTERNA'));
  for(const [selector,filename,title] of [
    ['.registration-other-card > footer [data-excluded-pdf]','CADASTROS_OUTROS_MUNICIPIOS_PA_2026.pdf','Cadastros de outros municípios'],
    ['.registration-unknown-card > footer [data-excluded-pdf]','CADASTROS_MUNICIPIO_NAO_CONFIRMADO_PA_2026.pdf','Cadastros para conferência'],
    ['[data-report-city="2"]','CADASTROS_MUNICIPIO_MUNICIPIO_B_PA_2026.pdf','Cadastros de MUNICÍPIO B']
  ]){
    downloaded=null;const button=panel.querySelector(selector);assert.ok(button);assert.equal(button.disabled,false);assert.ok(parseFloat(w.getComputedStyle(button).minHeight)>=44);button.click();$('report-format').value='compact';$('report-format').dispatchEvent(event('change'));$('report-prepare').click();await until(()=>!$('report-download').disabled,'Card PDF');assert.ok($('report-preview-title').textContent.includes(title));$('report-download').click();assert.equal(downloaded.filename,filename.replace('.pdf','_enxuto.pdf'));assert.ok(PDF.inspect(downloaded.bytes).pages>0);$('report-close').click();
  }
  panel.querySelector('.registration-unknown-card > footer button').click();$('report-prepare').click();await until(()=>!$('report-download').disabled,'Stale card PDF');downloaded=null;
  const staleFilter=panel.querySelector('[data-territory-filter=zone]');staleFilter.value='72';staleFilter.dispatchEvent(event('change'));$('report-download').click();assert.equal(downloaded,null);assert.ok($('report-feedback').textContent.includes('consulta mudou'));$('report-close').click();panel.querySelector('[data-territory-reset]').click();
  const municipalPicker=panel.querySelector('[data-territory-filter=city]');assert.equal(municipalPicker.options.length,3);municipalPicker.value='2';municipalPicker.dispatchEvent(event('change'));assert.equal(total('crm-registration-summary'),'2');assert.ok(panel.querySelector('.registration-municipality-banner').textContent.includes('MUNICÍPIO B'));assert.equal(panel.querySelector('[data-other-total]').textContent,'3');panel.querySelector('[data-territory-reset]').click();assert.equal(total('crm-registration-summary'),'2','Clearing filters keeps the municipality.');panel.querySelector('[data-territory-filter=city]').value='4154';panel.querySelector('[data-territory-filter=city]').dispatchEvent(event('change'));assert.equal(total('crm-registration-summary'),'3');
  const setCity=code=>{const select=panel.querySelector('[data-territory-filter=city]');select.value=code;select.dispatchEvent(event('change'));};
  setCity('');assert.equal(total('crm-registration-summary'),'5','All municipalities combines both confirmed cities.');
  assert.equal($('crm-report-municipality').value,'');assert.equal(panel.querySelector('[data-other-total]'),null);assert.equal(panel.querySelector('[data-unknown-total]').textContent,'1');
  const accounting=Object.fromEntries([...panel.querySelectorAll('[data-territory-accounting]')].map(el=>[el.querySelector('dt').textContent,el.querySelector('dd').textContent]));
  assert.equal(accounting['Cadastros na base deste recorte'],'6');assert.equal(accounting['Pessoas únicas na base'],'6');assert.equal(accounting['Pessoas com local confirmado'],'5');assert.equal(accounting['Município não confirmado'],'1');assert.equal(accounting['Pessoas no recorte exibido'],'5');
  panel.querySelector('[data-summary-pdf]').click();assert.deepEqual([...$('report-content-options').querySelectorAll('input:checked')].map(i=>i.value),['municipalities']);
  for(const input of $('report-content-options').querySelectorAll('input')){input.checked=input.value==='places';input.dispatchEvent(event('change'));}
  $('report-format').value='compact';$('report-format').dispatchEvent(event('change'));$('report-prepare').click();await until(()=>!$('report-download').disabled,'Selected territorial tables');
  assert.ok($('report-preview-meta').textContent.includes('Locais de votação / escolas'));assert.ok(!$('report-preview-meta').textContent.includes('Zonas e seções'));
  setCity('4154');downloaded=null;$('report-download').click();assert.equal(downloaded,null);assert.ok($('report-feedback').textContent.includes('consulta mudou'));$('report-close').click();
  const knownPlace=[...panel.querySelectorAll('[data-territory-kind="place"]')].find(b=>b.dataset.territoryKey!=='__missing');assert.ok(knownPlace);knownPlace.click();assert.equal(total('crm-registration-summary'),'2');assert.equal(panel.querySelector('.registration-territory-people').open,true);assert.equal(panel.querySelector('.registration-territory-people tbody').children.length,2);
  panel.querySelector('[data-territory-reset]').click();assert.equal(total('crm-registration-summary'),'3');
  const knownNeighborhood=[...panel.querySelectorAll('[data-territory-kind="neighborhood"]')].find(b=>b.textContent==='BAIRRO A');knownNeighborhood.click();assert.equal(total('crm-registration-summary'),'2');panel.querySelector('[data-territory-reset]').click();assert.equal(total('crm-registration-summary'),'3');
  const lazyTables=panel.querySelector('.registration-territory-tables');assert.equal(lazyTables.querySelector('[data-territory-tables-content]').children.length,0,'Closed tables should not allocate rows.');lazyTables.open=true;lazyTables.dispatchEvent(event('toggle'));
  assert.equal($('crm-registration-summary').querySelector('tfoot').textContent.replace(/\s/g,''),'Total3100,0%');
  $('crm-registration-summary').querySelector('[data-summary-zone="72"]').click();assert.equal(total('crm-registration-summary'),'3');assert.equal($('crm-table-body').children.length,3);
  $('crm-registration-summary').querySelector('[data-summary-pdf]').click();$('report-prepare').click();await until(()=>!$('report-download').disabled,'PDF');$('report-download').click();assert.ok(PDF.inspect(downloaded.bytes).pages>0);assert.equal(downloaded.filename,'TERRITORIO_CADASTROS_PA_2026_resumo_A4.pdf');
  downloaded=null;$('crm-clear-filters').click();$('report-download').click();assert.equal(downloaded,null);assert.ok($('report-feedback').textContent.includes('consulta mudou'));$('report-close').click();
  app.showWorkspaceView('analysis',false);assert.equal(app.state.candidate,null);assert.equal(total('analysis-registration-summary'),'3','Summary works without a candidate.');
  app.state.cityCode='2';w.CrmWorkspace.renderRegistrationSummary();assert.equal(total('analysis-registration-summary'),'3','Explicit cadastral municipality wins over an unrelated candidate filter.');
  const analysisCity=$('analysis-registration-summary').querySelector('[data-territory-filter=city]');analysisCity.value='';analysisCity.dispatchEvent(event('change'));assert.equal(total('analysis-registration-summary'),'5');
  const restoreCity=$('analysis-registration-summary').querySelector('[data-territory-filter=city]');restoreCity.value='4154';restoreCity.dispatchEvent(event('change'));assert.equal(total('analysis-registration-summary'),'3');
  $('analysis-registration-summary').querySelector('.registration-unknown-card > footer button').click();$('report-prepare').click();await until(()=>!$('report-download').disabled,'Analysis card PDF');$('report-download').click();assert.equal(downloaded.filename,'CADASTROS_MUNICIPIO_NAO_CONFIRMADO_PA_2026_resumo_A4.pdf');$('report-close').click();
  $('analysis-registration-summary').querySelector('[data-summary-zone="72"]').click();assert.equal(total('analysis-registration-summary'),'3');assert.equal($('analysis-zone-select').value,'72');
  $('analysis-zone-select').value='';$('analysis-zone-select').dispatchEvent(event('change'));
  const group=[...$('analysis-list-select').options].find(o=>o.textContent.includes('GRUPO B'));assert.ok(group);$('analysis-list-select').value=group.value;$('analysis-list-select').dispatchEvent(event('change'));assert.equal(total('analysis-registration-summary'),'0');assert.equal($('analysis-registration-summary').querySelector('[data-other-total]').textContent,'1');assert.equal($('analysis-registration-summary').querySelector('[data-unknown-total]').textContent,'1');
  app.state.cityCode='2';app.state.index={municipalities:[['4154','ANANINDEUA'],['2','MUNICÍPIO B']]};app.renderAnalysis();assert.equal(total('analysis-registration-summary'),'0','Candidate filter does not override the chosen cadastral municipality.');const explicitCity=$('analysis-registration-summary').querySelector('[data-territory-filter=city]');explicitCity.value='2';explicitCity.dispatchEvent(event('change'));assert.equal(total('analysis-registration-summary'),'1');assert.ok($('analysis-registration-summary').querySelector('.registration-municipality-banner').textContent.includes('MUNICÍPIO B'));setCity('4154');
  $('crm-status-filter').value='archived';$('crm-status-filter').dispatchEvent(event('change'));assert.equal(total('crm-registration-summary'),'1');assert.ok($('crm-registration-summary').textContent.includes('Somente arquivados'));
  assert.equal(panel.querySelector('.registration-other-card > footer button').disabled,true);assert.equal(panel.querySelector('.registration-unknown-card > footer button').disabled,true);
  assert.equal(w.getComputedStyle($('crm-registration-summary').querySelector('.table-wrap')).overflow,'auto');
  for(const control of panel.querySelectorAll('[data-territory-filter], [data-summary-pdf], [data-summary-csv], [data-territory-reset], [data-territory-map]'))assert.ok(parseFloat(w.getComputedStyle(control).minHeight)>=44);
  assert.equal(w.getComputedStyle(panel.querySelector('.registration-municipal-separation')).gridTemplateColumns.replaceAll(' ',''),width===360?'minmax(0,1fr)':'repeat(2,minmax(0,1fr))');
  assert.equal(w.getComputedStyle(panel.querySelector('.registration-territory-filters')).gridTemplateColumns.replaceAll(' ',''),width===360?'minmax(0,1fr)':'repeat(3,minmax(0,1fr))');
  assert.equal(w.getComputedStyle($('crm-registration-summary').querySelector('.registration-summary-metrics')).gridTemplateColumns.replaceAll(' ',''),width===360?'repeat(2,minmax(0,1fr))':'repeat(4,minmax(0,1fr))');
  await w.CrmWorkspace.lock();for(const id of ['crm-registration-summary','analysis-registration-summary']){assert.equal($(id).hidden,true);assert.equal($(id).textContent,'');}assert.equal($('report-preview-meta').children.length,0);assert.equal(writes,0);
  w.happyDOM.abort();await w.close();
}
console.log('Registration distribution passed: exact sums, 1,000 records, incomplete and archived rows, normalized zones/sections, both screens without candidate, scope and zone filters, PDF freshness, privacy clearing, mobile/desktop DOM emulation.');
