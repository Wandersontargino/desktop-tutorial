import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {Window} from 'happy-dom';
import Scope from '../public/election-scope.js';
import Paired from '../public/paired-analysis.js';
import {electionProjection} from '../worker/election-projection.mjs';
import {ALL_LEADERSHIPS,registryScope,analyzeAllLeaderships} from '../lib/group-partnership.mjs';
import {assess,confirmedElectoralLocation} from '../lib/crm-model.mjs';
import {municipalitySummary,pendencyScope} from '../lib/pendency-report.mjs';

const read=path=>JSON.parse(readFileSync(path,'utf8'));
if(process.argv[2]){
  const index=read('public/data/index.json'),roster=read('public/data/statewide.json').candidates;
  global.gc();const before=process.memoryUsage().heapUsed;let peak=before,result;
  if(process.argv[2]==='retained'){
    const cities=index.municipalities.map(([code])=>read('public/data/'+code+'.json'));
    global.gc();peak=Math.max(peak,process.memoryUsage().heapUsed);result=Scope.aggregateCities(cities,'Pará',roster,'__state__');
    global.gc();peak=Math.max(peak,process.memoryUsage().heapUsed);
  }else{
    const aggregator=Scope.createAggregator('Pará',roster,'__state__');
    for(const [code] of index.municipalities){let city=read('public/data/'+code+'.json');aggregator.addCity(city);city=null;global.gc();peak=Math.max(peak,process.memoryUsage().heapUsed);}
    result=aggregator.finish();
  }
  console.log(JSON.stringify({retainedHeapBytes:peak-before,votes:result.x[1],sections:result.s.length,cities:result.municipalityCodes.length}));
  process.exit();
}
globalThis.TEMPLATES=Object.fromEntries(['estadual','federal'].map(o=>[o,read('public/data/'+(o==='federal'?'federal/':'')+'regional.json')]));
globalThis.CANDIDATE_CATALOG=Object.fromEntries(['estadual','federal'].map(o=>[o,read('public/data/'+(o==='federal'?'federal/':'')+'statewide.json').candidates]));
const objects=new Map();let reads=0;
const BUCKET={get:async key=>objects.has(key)?{json:async()=>JSON.parse(objects.get(key))}:null,put:async(key,value)=>objects.set(key,value)};
const env={BUCKET,ASSETS:{fetch:async request=>{reads++;return new Response(readFileSync('public'+new URL(request.url).pathname),{headers:{'content-type':'application/json'}});}}};
const city=read('public/data/4278.json'),candidate=city.c.find(c=>c[1]==='15789'),section=city.s[0],query=`/api/election/estadual/projection?version=bundled&municipality=4278&candidate=${candidate[0]}&sections=${section[0]}-${section[1]}`;
const req=path=>new Request('https://example.test'+path,{headers:{'oai-authenticated-user-id':'test-user'}});
let response=await electionProjection(req(query),env,'estadual'),value=await response.json();
assert.deepEqual(value.rows,Paired.project(city,candidate[0],'estadual').filter(r=>r.zone===String(section[0])&&r.section===String(section[1])));
assert.equal(reads,1);await electionProjection(req(query),env,'estadual');assert.equal(reads,1,'Repeated reads must use external storage, without reparsing the full city.');
assert.ok(Buffer.byteLength(JSON.stringify(value))<Buffer.byteLength(JSON.stringify(city))*.01);
await assert.rejects(electionProjection(new Request('https://example.test'+query),env,'estadual'),e=>e.status===401);
await assert.rejects(electionProjection(req(query.replace('4278','99999')),env,'estadual'),e=>e.status===400);
await assert.rejects(electionProjection(req(query.replace('bundled','other')),env,'estadual'),e=>e.status===400);
await assert.rejects(electionProjection(req(query.replace(/sections=.*/, 'sections=1-2,x')),env,'estadual'),e=>e.status===400);

const w=new Window({url:'https://example.test'});let calls=0;
w.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,0));return new w.Response(JSON.stringify({rows:[1,2,3]}),{headers:{'content-type':'application/json'}});};
w.eval(readFileSync('public/data-cache.js','utf8'));
const cache=w.ElectionDataCache,[a,b]=await Promise.all([cache.load('/api/election/estadual/data/4278.json?version=a'),cache.load('/api/election/estadual/data/4278.json?version=a')]);
assert.strictEqual(a,b);assert.equal(calls,1);assert.strictEqual(await cache.load('/api/election/estadual/data/4278.json?version=a'),a);assert.equal(calls,1);
await cache.load('/api/election/estadual/data/4278.json?version=b');assert.equal(calls,2);
await cache.load('/api/crm/records');await cache.load('/api/crm/records');assert.equal(calls,4,'Private API responses must not enter the election cache.');
for(let i=0;i<30;i++)await cache.load('/data/'+i+'.json');assert.ok(cache.stats().entries<=24);assert.ok(cache.stats().estimatedBytes<=cache.stats().maxEstimatedBytes);
cache.clear();assert.equal(cache.stats().entries,0);assert.equal(cache.stats().estimatedBytes,0);await w.close();

const fakeTitle=i=>{const n=String(12345678+i),a=[...n].reduce((v,x,j)=>v+(+x)*(j+2),0)%11%10,b=(7+3*8+a*9)%11%10;return n+'13'+a+b;};
const title=fakeTitle(0),record={ready:true,primaryFlags:[],id:'a',name:'PESSOA FICTÍCIA',title,zone:'72',section:'372',leadership:'GRUPO A',coordinator:'COORDENAÇÃO',location:{cityCode:'4154',city:'ANANINDEUA',place:'ESCOLA',neighborhood:'CENTRO'}};
assert.ok(confirmedElectoralLocation(record));assert.ok(!confirmedElectoralLocation({...record,location:{...record.location,place:''}}));
const unknown={...record,id:'unknown',title:fakeTitle(2),location:{...record.location,place:'Local não informado'}};
assert.equal(municipalitySummary([unknown],{municipality:'4154'}).selected.total,0);assert.equal(municipalitySummary([unknown]).unknown,1);
assert.equal(assess(record,{'72|372':[unknown.location]}).ready,false);
const registered=[record,{...record,id:'copy',leadership:'GRUPO B'},{...record,id:'second',title:fakeTitle(1),name:'OUTRA PESSOA FICTÍCIA'},{...unknown,id:'pending',ready:false}];
const registry=registryScope(registered,ALL_LEADERSHIPS);assert.equal(registry.total,4);assert.equal(registry.eligible,2);assert.equal(registry.repeated,1);assert.equal(registry.pending,1);
const vote={key:Paired.sectionKey('4154',72,372),code:'4154',city:'ANANINDEUA',zone:'72',section:'372',place:'ESCOLA',neighborhood:'CENTRO',e:10,f:8,te:20,tf:20};
const all=analyzeAllLeaderships(registered,[vote],{city:'4154'});assert.equal(all.leaderships.length,2);assert.equal(all.registered,2);assert.equal(all.e,10);assert.equal(all.f,8);assert.equal(all.overlap.sections,1);
const searched=pendencyScope([{...unknown,ready:false,primaryFlags:[{message:'Local de votação não confirmado.'}]}],{user:{role:'owner'},mode:'unapproved',search:'PESSOA'});assert.equal(searched.selectedCount,1);
assert.equal(pendencyScope([{...unknown,ready:false}],{user:{role:'owner'},mode:'unapproved',search:'INEXISTENTE'}).selectedCount,0);

const benchmark=mode=>{const child=spawnSync(process.execPath,['--expose-gc','scripts/check_performance.mjs',mode],{encoding:'utf8'});assert.equal(child.status,0,child.stderr);return JSON.parse(child.stdout);};
const retained=benchmark('retained'),streamed=benchmark('streamed');
assert.equal(streamed.votes,retained.votes);assert.equal(streamed.sections,retained.sections);assert.equal(streamed.cities,144);assert.ok(streamed.retainedHeapBytes<retained.retainedHeapBytes*.85,'Streaming should materially reduce retained heap.');
console.log(JSON.stringify({check:'Performance, external election storage, municipal confirmation, all leaderships and quick search',projection:{fullCityBytes:Buffer.byteLength(JSON.stringify(city)),selectedSectionBytes:Buffer.byteLength(JSON.stringify(value)),externalCacheReads:reads},municipalAggregation:{before:retained,after:streamed,reductionPercent:Math.round(100*(1-streamed.retainedHeapBytes/retained.retainedHeapBytes))}},null,2));
