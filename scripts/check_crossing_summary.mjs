import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import M from '../public/crossing-model.js';
import P from '../public/paired-analysis.js';
import PDF from '../public/report-pdf.js';

// Reproduce the dimensions and distribution of the supplied screenshot.
// These fixture totals test layout only; they are not a replacement data source.
const territories=[['1','ANANINDEUA','43',50,120,69],['1','ANANINDEUA','72',4,13,7],['1','ANANINDEUA','107',1,1,0],['2','BELÉM','30',1,1,16],['3','GARRAFÃO DO NORTE','81',1,0,0],['4','MARAPANIM','32',2,2,2],['5','MARITUBA','78',2,21,1]];
const rows=territories.map(([code,city,zone,registered,e,f],i)=>({code,city,zone,section:String(i+1),key:P.sectionKey(code,zone,i+1),registered,e,f,place:'ESCOLA DE TESTE',neighborhood:'BAIRRO DE TESTE',locationConflict:false}));
const slots=[{office:'estadual',candidate:['1','15789','CARLOS VINÍCIOS DE MELO VIEIRA']},{office:'federal',candidate:['2','1212','CARLOS EDILSON DE ALMEIDA MANESCHY']}];
const registry={total:62,eligible:62,pending:0,repeated:0,conflicting:0,sections:rows};
const result=M.evaluate({projected:[[],[]],joined:rows,slots,registry,registryMode:true});
const options={scope:'ANANINDEUA, BELÉM, GARRAFÃO DO NORTE, MARAPANIM, MARITUBA',sources:['Campo 1: Fonte de teste • versão v1','Campo 2: Fonte de teste • versão v1'],registryGroups:[{leadership:'FATIMA - AURÁ',coordinator:'VILMAR PEREIRA',total:62,eligible:62,pending:0,registered:61}]};
const before=JSON.stringify(result),summary=M.summaryReport(result,options),complete=M.report(result,options);
const example=M.reach({...result,metrics:{...result.metrics,registryUpper:38}});
assert.deepEqual(example,{total:62,reached:38,remaining:24,ratio:38/62});
assert.equal(new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(example.ratio),'61,3%');
assert.equal(M.reach({...result,registry:{...result.registry,total:67,repeated:5},metrics:{...result.metrics,registryUpper:38}}).total,62,'Verified duplicate titles must not inflate the percentage denominator.');
assert.equal(M.reach({...result,registry:{...result.registry,total:0,eligible:0},metrics:{...result.metrics,registryUpper:0}}).ratio,null);
assert.equal(M.reach({...result,metrics:{...result.metrics,registryUpper:null}}).ratio,null);
assert.deepEqual(summary.dashboard,complete.dashboard);
assert.deepEqual(summary.blocks.map(b=>b.title),['Resumo das lideranças selecionadas','Municípios','Zonas']);
assert.deepEqual(summary.blocks.map(b=>b.rows.length),[1,5,7]);
assert.deepEqual(summary.blocks.map(b=>b.rows),complete.blocks.slice(0,3).map(b=>b.rows),'Summary must retain every row and numeric cell of its three tables.');
assert.deepEqual(summary.indicators,complete.indicators);
assert.ok(summary.candidates[1].includes('C2: Federal • 1212'));
assert.deepEqual(summary.blocks[1].headers,['Território','Cadastros','Votos C1','Votos C2','Diferença 2 - 1','Teto por seção','Teto com cadastros']);
assert.ok(summary.note.includes('não some'));
assert.equal(PDF.inspect(PDF.build(summary)).pages,1);
assert.equal(complete.blocks.length,6,'Complete report keeps schools, sections and neighborhoods.');
assert.ok(PDF.inspect(PDF.build(complete)).pages>1);
assert.equal(JSON.stringify(result),before,'Rendering must not mutate query results.');
const multiple=M.summaryReport(result,{...options,registryGroups:[...options.registryGroups,{...options.registryGroups[0],leadership:'OUTRA LIDERANÇA'}]});
assert.equal(PDF.inspect(PDF.build(multiple)).pages,1);
const missing=M.summaryReport({...result,metrics:{...result.metrics,b:null,upper:null,registryUpper:null,difference:null,missing:1},groups:{...result.groups,municipality:result.groups.municipality.map((g,i)=>i?g:{...g,b:null,difference:null,upper:null,registryUpper:null})}},options);
assert.ok(missing.blocks[1].rows.some(r=>r.includes('Sem cobertura')));assert.equal(PDF.inspect(PDF.build(missing)).pages,1);assert.equal(missing.dashboard.ratio,null);
for(const pair of [[slots[0],{...slots[1],office:'estadual'}],[null,slots[1]]]){
  const value=M.evaluate({projected:[[],[]],joined:rows,slots:pair});
  const report=M.summaryReport(value,{scope:'Recorte de teste'});
  assert.equal(PDF.inspect(PDF.build(report)).pages,1);
  assert.ok(!report.blocks[0].headers.includes('Teto por seção'));
  assert.ok(!report.blocks[0].headers.includes('Cadastros'));
  assert.equal(report.dashboard,null);
  if(!pair[0]){assert.deepEqual(report.blocks[0].headers,['Território','Votos C2']);assert.ok(!report.note.includes('Diferença'));}
}
for(const pair of [[slots[0],null],[null,slots[1]]]){
  const individual=M.summaryReport(M.evaluate({projected:[[],[]],joined:rows,slots:pair,registry,registryMode:true}),options);
  assert.deepEqual(individual.blocks.map(b=>b.rows.length),[1,5,7]);assert.equal(PDF.inspect(PDF.build(individual)).pages,1,'The reference distribution must also fit in individual registry mode.');
}
// Large selections are consolidated, with exact totals for every territory.
const stateRows=Array.from({length:288},(_,i)=>{const code=String(Math.floor(i/2)+1),zone=String(i%2+1);return {code,city:'MUNICÍPIO DE TESTE '+code,zone,section:'1',key:P.sectionKey(code,zone,1),registered:i%7+1,e:i%11?1000+i*13:0,f:i%13?800+i*7:0,place:'ESCOLA DE TESTE',neighborhood:'BAIRRO DE TESTE',locationConflict:false};});
const eligible=stateRows.reduce((n,r)=>n+r.registered,0),largeRegistry={total:eligible+10,eligible,pending:7,pendingIncluded:13,repeated:3,conflicting:0,sections:stateRows};
const groupList=Array.from({length:120},(_,i)=>({leadership:'LIDERANÇA DE TESTE '+i,coordinator:'COORDENADOR DE TESTE',total:10,eligible:8,pending:2,registered:8}));
const stateOptions={scope:stateRows.map(r=>r.city).join(', '),stateCityCodes:[...new Set(stateRows.map(r=>r.code))],filterLabel:'Todos os locais dos municípios consultados',groupLabel:'Coordenador: COORDENADOR DE TESTE',registryGroups:groupList,sources:['Fonte estadual de teste '+('documentação '.repeat(50))+' • versão teste-v42','Fonte federal de teste '+('documentação '.repeat(50))+' • versão teste-v43']};
const largeCases=[];
for(const [label,pair,registryMode]of [['estado',slots,false],['cadastros',slots,true],['estadual',[slots[0],null],true],['federal',[null,slots[1]],true],['mesmo-cargo',[slots[0],{...slots[1],office:'estadual'}],false]]){
 const value=M.evaluate({projected:[[],[]],joined:stateRows,slots:pair,registry:largeRegistry,registryMode}),original=JSON.stringify(value),report=M.summaryReport(value,stateOptions),selected=PDF.resolveSummary(report).report;
 assert.equal(PDF.inspect(PDF.build(report)).pages,1,label+' must always fit on one A4 page.');assert.equal(selected.summaryConsolidated,true);assert.ok(selected.note.includes('Totais de todo o recorte'));assert.ok(selected.meta.some(([k,v])=>k==='Recorte'&&v.includes('144 municípios')));assert.ok(selected.sources.every(s=>/teste-v4[23]$/.test(s)),'Source versions survive abbreviation.');
 assert.deepEqual(selected.indicators,report.indicators);assert.deepEqual(selected.dashboard,report.dashboard);assert.deepEqual(selected.finalResult.items,report.finalResult.items);
 for(const compact of report.summaryVariants){
  for(const unit of ['municipality','zone']){
   const block=compact.blocks.find(b=>b.title===(unit==='municipality'?'Municípios — síntese':'Zonas — síntese'));if(!block)continue;
   for(const index of [0,1]){if(!pair[index])continue;const column=block.headers.indexOf('Votos C'+(index+1)),sum=block.rows.reduce((n,r)=>n+Number(r[column].replaceAll('.','')),0);assert.equal(sum,value.metrics[index?'b':'a'],'Grouped rows must include all candidate votes.');}
   if(value.metrics.cross){const column=block.headers.indexOf(registryMode?'Teto com cadastros':'Compatíveis (teto)'),sum=block.rows.reduce((n,r)=>n+Number(r[column].replaceAll('.','')),0);assert.equal(sum,registryMode?value.metrics.registryUpper:value.metrics.upper,'Never recompute the minimum from municipal totals.');}
  }
 }
 assert.equal(JSON.stringify(value),original,'Summarizing must not alter filters or loaded vote rows.');largeCases.push([label,report]);
}
const incomplete=M.evaluate({projected:[[],[]],joined:stateRows.map((r,i)=>i?r:{...r,f:null}),slots,registry:largeRegistry,registryMode:true}),incompleteSummary=M.summaryReport(incomplete,stateOptions),incompleteView=PDF.resolveSummary(incompleteSummary).report;
assert.equal(PDF.inspect(PDF.build(incompleteSummary)).pages,1);assert.equal(incompleteView.dashboard.reached,null);assert.ok(incompleteView.finalResult.summary.includes('não calculada'));assert.ok(incompleteView.meta.some(([k,v])=>k==='Conferência'&&v.includes('1 a conferir')));
const unstructured={...summary,summaryVariants:[],blocks:summary.blocks.map(b=>({...b,rows:Array.from({length:144},(_,i)=>[...b.rows[i%b.rows.length]])}))};assert.throws(()=>PDF.build(unstructured),/página legível/,'Malformed unstructured reports must not spill or silently clip.');
if(process.argv[3])for(const [label,report]of [...largeCases,['sem-cobertura',incompleteSummary]])writeFileSync(process.argv[3]+'/'+label+'.pdf',PDF.build(report));
if(process.argv[2])writeFileSync(process.argv[2],PDF.build({...summary,generatedAt:'18/10/2026, 07:03:36'}));
console.log('One-page A4 summary passed: reference distribution, all numeric cells, multiple leaderships, missing data, same-office and individual queries, automatic consolidation of 144 municipalities / 288 territorial zones / 120 leaderships, exact preserved totals and source versions, with missing data distinct from zero.');
