import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { candidateMatches,placeMatches,municipalCoverage,initUniversalSearch } from '../src/unified-search.mjs';
import { cityPlaces } from '../lib/election-model.mjs';
const read=(office,file)=>JSON.parse(readFileSync('public/data/'+(office==='federal'?'federal/':'')+file+'.json','utf8'));
const catalogs=['estadual','federal'].map(office=>({office,index:read(office,'index'),statewide:read(office,'statewide'),names:read(office,'candidate-names-2026')}));
const estadual=catalogs[0],federal=catalogs[1],carlos=estadual.statewide.candidates.find(c=>c[1]==='15789'),federalCandidate=federal.statewide.candidates.find(c=>c[1]==='1212')||federal.statewide.candidates[0],regional=read('estadual','regional');
assert.equal(candidateMatches('15789',catalogs)[0].office,'estadual');assert.equal(candidateMatches('15.789',catalogs)[0].id,carlos[0]);assert.equal(candidateMatches('raio-x 15.789 em Ananindeua',catalogs)[0].city,'4154');
assert.equal(candidateMatches(federalCandidate[1],catalogs)[0].office,'federal');assert.equal(candidateMatches('Carlos Vinícios',catalogs)[0].id,carlos[0]);assert.equal(candidateMatches('Escola Estadual Carlos',catalogs).length,0);assert.ok(candidateMatches('Carlos',catalogs).length>1);
const homonyms=[{...estadual,statewide:{...estadual.statewide,candidates:[['a','12345','PESSOA TESTE',1,1,1,[['4014',1]]]]}},{...federal,statewide:{...federal.statewide,candidates:[['b','1234','PESSOA TESTE',1,1,1,[['4014',1]]]]}}];assert.equal(candidateMatches('Pessoa Teste',homonyms).length,2);
const named=office=>({office,index:estadual.index,statewide:{candidates:[[office==='estadual'?'1':'2',office==='estadual'?'12345':'1234','NOME COMPLETO DE TESTE',1,1,1,[]]]},names:{electionYear:2026,uf:'PA',office,turn:1,source:{field:'NM_URNA_CANDIDATO'},candidates:{[office==='estadual'?'1':'2']:{number:office==='estadual'?'12345':'1234',fullName:'NOME COMPLETO DE TESTE',ballotName:'APELIDO OFICIAL'}}}});
const ballotHomonyms=[named('estadual'),named('federal')];assert.equal(candidateMatches('Apelido Oficial',ballotHomonyms).length,2);assert.equal(candidateMatches('Nome Completo de Teste',ballotHomonyms).length,2);assert.equal(candidateMatches('Apelido Oficial federal',ballotHomonyms)[0].office,'federal');
const wrongIdentity=structuredClone(ballotHomonyms);wrongIdentity.forEach(c=>c.names.candidates[c.statewide.candidates[0][0]].number='99999');assert.equal(candidateMatches('Apelido Oficial',wrongIdentity).length,0);
const count=municipalCoverage(carlos,regional,'r01');assert.equal(count.total,new Set(carlos[6].filter(p=>p[1]>0).map(p=>p[0])).size);assert.equal(count.regional,carlos[6].filter(([code,v])=>v>0&&regional.municipalities.some(m=>m[0]===code&&m[2]==='r01')).length);
const synthetic=cityPlaces({m:['4014','ABAETETUBA'],s:[[1,1,'ESCOLA SÃO JOSÉ','CENTRO'],[1,2,'ESCOLA SÃO JOSÉ','CENTRO'],[2,3,'ESCOLA SÃO JOSÉ','CENTRO'],[1,4,'','']]});assert.equal(synthetic.length,2);assert.deepEqual(synthetic[0].sections,['1','2']);
const schools=[...synthetic,...cityPlaces({m:['4154','ANANINDEUA'],s:[[43,12,'ESCOLA SÃO JOSÉ','CENTRO']]})];assert.equal(placeMatches('Escola Sao Jose',catalogs,schools).length,3);const exactPlace=placeMatches('Escola Sao Jose em Ananindeua',catalogs,schools);assert.equal(exactPlace.length,1);assert.equal(exactPlace[0].city,'4154');
const w=new Window({url:'https://example.test',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});w.document.body.innerHTML='<form id="guided-query-form"><input id="guided-query-input"><div id="guided-query-results" hidden></div><p id="guided-query-status"></p><p id="guided-query-coverage" hidden></p></form>';
w.PlatformTools={manifests:new Map([['estadual',{active:'bundled'}],['federal',{active:'bundled'}]]),dataURL:(file,office)=>'/'+office+'/'+file};
w.fetch=async path=>{const [,office,file]=path.split('/');const catalog=catalogs.find(c=>c.office===office);return new w.Response(JSON.stringify(file==='places.json'?{electionYear:2026,office,places:schools}:file==='statewide.json'?catalog.statewide:file==='candidate-names-2026.json'?catalog.names:catalog.index));};
w.eval(readFileSync('public/candidate-identity.js','utf8'));
let calls=[],fallbackCalls=0;const state={office:'estadual',view:'overview',statewide:estadual.statewide,candidate:carlos,regional,regionFilter:''};
// Run the browser controller in its own Window context with its real pure matching functions.
const source=readFileSync('src/unified-search.mjs','utf8').replaceAll('export ','')+'\nwindow.initSearch=initUniversalSearch;';w.eval(source);
const ctrl=w.initSearch({state,query:async options=>{calls.push(options);if(options.office){state.office=options.office;state.statewide=catalogs.find(c=>c.office===options.office).statewide;}if(options.candidate)state.candidate=state.statewide.candidates.find(c=>c[0]===options.candidate);return true;},fallback:async()=>{fallbackCalls++;}});
const $=id=>w.document.getElementById(id),event=type=>new w.Event(type,{bubbles:true,cancelable:true});async function until(test){for(let i=0;i<100;i++){if(test())return;await new Promise(r=>setTimeout(r,25));}throw new Error('Search timeout: '+$('guided-query-status').textContent);}
$('guided-query-input').value=federalCandidate[1];$('guided-query-input').dispatchEvent(event('input'));await until(()=>calls.length===1);assert.equal(calls[0].office,'federal');assert.equal(calls[0].candidate,federalCandidate[0]);assert.ok($('guided-query-coverage').textContent.includes('Municípios com votos'));
$('guided-query-input').value='Carlos Vinícios';$('guided-query-input').dispatchEvent(event('input'));await until(()=>calls.length===2);assert.equal(calls[1].office,'estadual');
$('guided-query-input').value='Escola Sao Jose';$('guided-query-form').dispatchEvent(event('submit'));await until(()=>$('guided-query-results').children.length===3);assert.equal(calls.length,2);assert.ok($('guided-query-results').textContent.includes('ANANINDEUA'));
const choice=[...$('guided-query-results').children].find(b=>b.textContent.includes('ANANINDEUA'));choice.click();await until(()=>calls.length===3);assert.equal(calls[2].place,'ESCOLA SÃO JOSÉ');assert.equal(calls[2].city,'4154');assert.equal(calls[2].zone,'43');assert.equal(calls[2].region,'');
state.regionFilter='r01';ctrl.coverage();assert.ok($('guided-query-coverage').textContent.includes('Região Metropolitana'));
$('guided-query-input').value='ANANINDEUA';$('guided-query-form').dispatchEvent(event('submit'));await until(()=>fallbackCalls===1);assert.equal(calls.length,3);
const byBallot=federal.statewide.candidates.find(c=>{const name=federal.names.candidates[c[0]].ballotName,found=candidateMatches(name,catalogs);return name!==c[2]&&found.length===1&&found[0].id===c[0];});assert.ok(byBallot);
$('guided-query-input').value=federal.names.candidates[byBallot[0]].ballotName;$('guided-query-form').dispatchEvent(event('submit'));await until(()=>calls.length===4);assert.equal(calls[3].office,'federal');assert.equal(calls[3].candidate,byBallot[0]);
w.happyDOM.abort();await w.close();
// Exercise the real app routing, including a candidate with zero votes in a school.
const app=new Window({url:'https://example.test',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});app.Option=function(text='',value=''){const o=app.document.createElement('option');o.textContent=text;o.value=value;return o;};app.document.write(readFileSync('public/index.html','utf8'));app.eval(readFileSync('public/election-scope.js','utf8'));app.eval(readFileSync('public/municipal-report.js','utf8'));
app.PlatformTools={manifests:new Map(),loadManifest:async office=>({active:'bundled'}),dataURL:(file,office)=>'/data/'+(office==='federal'?'federal/':'')+file};app.scrollTo=()=>{};
app.fetch=async url=>{const pathname=new URL(url,'https://example.test').pathname;try{return new app.Response(readFileSync('public'+pathname));}catch{return new app.Response('missing',{status:404});}};
app.eval(readFileSync('public/candidate-identity.js','utf8'));
app.eval(readFileSync('public/app.js','utf8').replace('  init();','  window.searchTest={state,loadIndex,runGuidedQuery,pdfReport,exportCandidateXray,applyRegionFilter,loadCity,selectCandidate,filteredMunicipalities,renderTerritoryFilters,showWorkspaceView,toast,fmtInt};'));
const a=app.searchTest;await a.loadIndex('estadual');await a.runGuidedQuery({office:'federal',candidate:federalCandidate[0],view:'overview'});assert.equal(a.state.office,'federal');assert.equal(a.state.candidate[0],federalCandidate[0]);
assert.equal(app.document.getElementById('candidate-name').textContent,federalCandidate[2]);assert.equal(app.document.getElementById('candidate-ballot-name').textContent,federal.names.candidates[federalCandidate[0]].ballotName);
assert.equal(a.pdfReport('overview').meta.find(r=>r[0]==='Nome de urna')[1],federal.names.candidates[federalCandidate[0]].ballotName);
assert.equal(a.pdfReport('xray').meta.find(r=>r[0]==='Nome de urna')[1],federal.names.candidates[federalCandidate[0]].ballotName);
let csvBlob;app.URL.createObjectURL=blob=>{csvBlob=blob;return 'blob:test';};app.URL.revokeObjectURL=()=>{};app.HTMLAnchorElement.prototype.click=()=>{};a.exportCandidateXray();const csv=await csvBlob.text();assert.ok(csv.includes('Nome de urna'));assert.ok(csv.includes(federal.names.candidates[federalCandidate[0]].ballotName));assert.ok(csv.includes(federalCandidate[2]));
await a.runGuidedQuery({office:'estadual',candidate:carlos[0],view:'overview'});assert.equal(a.state.candidate[0],carlos[0]);
assert.equal(app.document.getElementById('candidate-ballot-name').textContent,estadual.names.candidates[carlos[0]].ballotName);
const city=read('estadual','4014'),zeroCandidate=estadual.statewide.candidates.find(c=>!c[6].some(([code,v])=>code==='4014'&&v>0)),school=city.s.find(s=>s[2]&&s[3]);
await a.runGuidedQuery({office:'estadual',region:'',city:'4014',candidate:zeroCandidate[0],zone:String(school[0]),place:school[2],neighborhood:school[3],view:'territory'});assert.equal(a.state.candidate[0],zeroCandidate[0]);assert.equal(a.state.candidate[3],0);assert.equal(a.state.territoryPlace,school[2]);assert.equal(app.document.getElementById('territory-place-select').value,school[2]);assert.equal(a.state.territoryZone,String(school[0]));
const before=a.state.office;assert.equal(await a.runGuidedQuery({office:'federal',candidate:federalCandidate[0],guard:()=>false}),false);assert.equal(a.state.office,before);
// Reopen a saved statewide consultation through the real favorites controller.
let savedFavorites={revision:0,items:[]};
app.fetch=async (url,options={})=>{
  const pathname=new URL(url,'https://example.test').pathname;
  if(pathname==='/api/favorites'){
    if(options.method==='PUT')savedFavorites={revision:savedFavorites.revision+1,items:JSON.parse(options.body).items};
    return new app.Response(JSON.stringify(savedFavorites));
  }
  if(/^\/api\/election\/(estadual|federal)\/manifest$/.test(pathname))return new app.Response(JSON.stringify({active:'bundled',revision:0,versions:[]}));
  const file=pathname.replace(/^\/api\/election\/(estadual|federal)\/data\//,(_,office)=>'/data/'+(office==='federal'?'federal/':''));
  try{return new app.Response(readFileSync('public'+file));}catch{return new app.Response('missing',{status:404});}
};
app.eval(readFileSync('public/platform-tools.js','utf8'));app.PlatformTools.init(a);
const fav=id=>app.document.getElementById(id);
async function favoriteReady(test){for(let i=0;i<100;i++){if(test())return;await new Promise(r=>setTimeout(r,10));}throw new Error('Favorite timeout: '+fav('favorite-status').textContent);}
await favoriteReady(()=>!fav('favorite-save').disabled);
await a.runGuidedQuery({city:'__state__',candidate:carlos[0],view:'overview'});
assert.equal(a.state.candidate[3],carlos[3]);assert.equal(a.state.city.municipalityCodes.length,144);
assert.equal(a.pdfReport('overview').meta.find(r=>r[0]==='Município / recorte')[1],'Todos os municípios do Pará');
fav('favorite-save').click();await favoriteReady(()=>savedFavorites.items.length===1&&!fav('favorite-save').disabled);
assert.equal(savedFavorites.items[0].cityCode,'__state__');assert.equal(savedFavorites.items[0].regionFilter,'');
await a.applyRegionFilter('r01');assert.equal(a.state.city.municipalityCodes.length,5);
fav('favorite-select').value=savedFavorites.items[0].id;fav('favorite-select').dispatchEvent(event('change'));fav('favorite-open').click();
await favoriteReady(()=>a.state.cityCode==='__state__'&&a.state.city?.municipalityCodes.length===144&&!fav('favorite-open').disabled);
assert.equal(a.state.regionFilter,'');assert.equal(a.state.candidate[0],carlos[0]);assert.equal(a.state.candidate[3],carlos[3]);
app.happyDOM.abort();await app.close();
console.log('Search checks passed: cross-office numbers and names, dotted numbers, homonym choices, school municipality/zone disambiguation, automatic routing, exact statewide/regional coverage, preserved zero-vote school filter, stale-query guard, statewide totals and complete report scope, and saved statewide consultation reopening. DOM emulation.');
