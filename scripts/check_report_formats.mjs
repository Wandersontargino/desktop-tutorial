import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import PDF from '../public/report-pdf.js';
import {assessRecords} from '../lib/crm-model.mjs';
import {buildSimpleRegistrationReport} from '../lib/simple-registration-report.mjs';
import {buildPendencyReport} from '../lib/pendency-report.mjs';
import {twentyRecords,largerLeadership,reportLocations,syntheticTitle} from './fixtures/registration-report.mjs';

const owner={role:'owner'},int=value=>value.toLocaleString('pt-BR'),generatedAt='22/10/2026, 18:00:00';
const rows=Array.from({length:144},(_,i)=>['MUNICÍPIO EXEMPLO '+String(i+1).padStart(3,'0'),int(i*13),int(i*9),i?'+44,4%':'Sem base']);
const current=rows.reduce((sum,_,i)=>sum+i*13,0),previous=rows.reduce((sum,_,i)=>sum+i*9,0);
const candidate={title:'Relatório do candidato — exemplo de teste',subtitle:'15789 — CANDIDATURA FICTÍCIA',generatedAt,
  meta:[['Eleição','2026 • 1º turno'],['Recorte','Todos os 144 municípios do Pará'],['Fonte 2026','TSE • fonte fictícia para teste • versão teste-2026-v91'],['Fonte 2022','TSE • fonte fictícia para teste • versão teste-2022-v2']],
  indicators:[{label:'Votos 2026',value:int(current)},{label:'Votos 2022',value:int(previous)},{label:'Diferença de votos',value:'+'+int(current-previous),color:'#208a5b'},{label:'Municípios',value:'144'}],
  note:'Comparação do mesmo cargo e candidato. Zero confirmado não é ausência de dados. Todos os municípios entram no total.',
  finalResult:{title:'Resultado final',summary:int(current)+' votos em 2026 • '+int(previous)+' em 2022 • +'+int(current-previous)+' votos',detail:'Total dos 144 municípios.'},
  blocks:[{type:'bars',title:'Votação comparada — municípios',rows:rows.slice(0,5).map((row,i)=>({label:row[0],values:[{label:'2026',value:i*13,color:'#1262ae'},{label:'2022',value:i*9,color:'#9cacbf'}]}))},
    {type:'table',title:'Todos os municípios',headers:['Município','Votos 2026','Votos 2022','Variação'],widths:[3,1,1,1],rows:[...rows,['TOTAL',int(current),int(previous),'+44,4%']],cellColors:rows.map(()=>[null,null,null,'#208a5b'])}]};
const historic={...candidate,title:'Histórico — 2018 e 2022',electionYear:2022,headerSubtitle:'2018 / 2022 • mesmo cargo e turno',meta:[['Eleição','2022 • comparação com 2018'],['Recorte','13 regiões da configuração atual'],['Fonte','Fonte de teste • versão historico-2022']],indicators:[{label:'Votos 2022',value:'1.560'},{label:'Votos 2018',value:'1.716'},{label:'Diferença de votos',value:'-156',color:'#bc3030'},{label:'Regiões',value:'13'}],finalResult:{title:'Resultado histórico',summary:'1.560 votos em 2022 • 1.716 em 2018 • -156 votos'},note:'Comparação do mesmo cargo e candidato em 2018 e 2022. Regiões conforme a configuração territorial da plataforma.',blocks:[{type:'table',title:'Resultados por região',headers:['Região','Votos 2022','Votos 2018','Diferença'],rows:Array.from({length:13},(_,i)=>['REGIÃO EXEMPLO '+i,int(i*20),int(i*22),i?'-'+int(i*2):'0']),cellColors:Array.from({length:13},()=>[null,null,null,'#bc3030'])}]};
const sameOffice={...candidate,title:'Comparação de duas candidaturas',subtitle:'Estadual • 11111 CANDIDATO A × 22222 CANDIDATO B',indicators:[...candidate.indicators,{label:'Votos C2',value:'80.000'},{label:'Diferença C2 - C1',value:'-53.848',color:'#bc3030'}],finalResult:{title:'Resultado final do comparativo',summary:'C1: 133.848 votos • C2: 80.000 votos • diferença: -53.848'},note:'Diferença entre candidatos do mesmo cargo; não é compatibilidade entre cargos.'};
const raw=twentyRecords(),records=assessRecords(raw,reportLocations);
const simple=buildSimpleRegistrationReport(records,{user:owner,generatedAt:'2026-10-22T21:00:00Z'}).report;
const pending=buildPendencyReport(assessRecords(largerLeadership(),reportLocations),{user:owner,revision:593,pendingChanges:2,conflicts:1,online:false,municipality:'4154',municipalityName:'Ananindeua',generatedAt:'2026-10-22T21:00:00Z'}).report;
const incomplete={...candidate,title:'Cobertura incompleta — exemplo',indicators:[{label:'Votos estaduais',value:'1.200'},{label:'Votos federais',value:'Sem cobertura'},{label:'Compatíveis (teto)',value:'Não calculado'}],finalResult:{title:'Resultado final',summary:'Compatibilidade não calculada — cobertura incompleta'},note:'Há seções sem dados. Ausência de cobertura não foi convertida em zero.',blocks:[{type:'table',title:'Resultado por município',headers:['Município','Estadual','Federal','Compatíveis'],rows:[['MUNICÍPIO A','1.200','Sem cobertura','Não calculado'],['MUNICÍPIO B','0','0','0']]}]};
const cases=[['municipios',candidate],['historico',historic],['mesmo-cargo',sameOffice],['cadastros',simple],['pendencias',pending],['sem-cobertura',incomplete]];
const directory=process.argv[2];if(directory)mkdirSync(directory,{recursive:true});
for(const [label,report]of cases){
  const before=JSON.stringify(report),summary=PDF.formatReport(report,'summary'),bytes=PDF.build(summary);
  assert.equal(PDF.inspect(bytes).pages,1,label+' must fit one legible A4 page.');
  assert.deepEqual(summary.indicators,report.indicators,label+' must preserve every producer indicator.');
  assert.deepEqual(summary.finalResult,report.finalResult,label+' must preserve the producer final result.');
  assert.equal(JSON.stringify(report),before,'Formatting must never mutate the original report or its full tables.');
  assert.ok(summary.summaryInfo.description.includes('Listagens completas'));
  if(label==='historico')assert.equal(summary.blocks[0].rows.length,13,'Keep all regions when they fit legibly.');
  if(label==='historico')assert.ok(!JSON.stringify({...summary,generatedAt:'',summaryVariants:[]}).includes('2026'),'A historic summary must not reuse the current-election labels or totals.');
  if(directory)writeFileSync(directory+'/'+label+'.pdf',bytes);
}
const summary=PDF.formatReport(candidate,'summary');
assert.ok(summary.sources.some(value=>value.endsWith('teste-2026-v91')));assert.ok(summary.sources.some(value=>value.endsWith('teste-2022-v2')));
assert.ok(summary.blocks[0].rows.some(row=>row[0]==='TOTAL'&&row[1]===int(current)),'An existing authoritative total row must survive an excerpt.');
assert.ok(summary.summaryChart.rows.every(row=>row.values.length===2),'An available historic series must accompany the current series.');
const registrySummary=PDF.formatReport(simple,'summary');
assert.ok(!JSON.stringify(registrySummary).includes('PESSOA FICTÍCIA'),'Executive registration summaries must not silently include incomplete nominal listings.');
assert.ok(registrySummary.summaryInfo.nominalLines===20);
assert.ok(JSON.stringify(PDF.formatReport(incomplete,'summary')).includes('Sem cobertura'));
assert.throws(()=>PDF.formatReport(candidate,'unknown'),/formato/);
const essential={type:'table',summaryEssential:true,title:'Cenário hipotético informado',headers:['Hipótese','Quantidade'],rows:[['Nos dois candidatos','12'],['Somente estadual','3'],['Somente federal','4'],['Nenhum / abstenção','1']]};
const scenarioSummary=PDF.formatReport({...sameOffice,blocks:[...sameOffice.blocks,essential]},'summary');
assert.deepEqual(scenarioSummary.blocks.find(block=>block.summaryEssential).rows,essential.rows,'A selected hypothetical scenario must retain every anonymous category, including in the shortest summary.');
assert.equal(PDF.inspect(PDF.build(scenarioSummary)).pages,1);

const largeRecords=assessRecords(Array.from({length:1200},(_,i)=>({...raw[i%raw.length],id:'large-'+i,name:'PESSOA DE TESTE '+String(i).padStart(4,'0'),title:syntheticTitle(i+5000),leadership:'LIDERANÇA EXEMPLO '+Math.floor(i/60)})),reportLocations);
const large=buildSimpleRegistrationReport(largeRecords,{user:owner,generatedAt:'2026-10-22T21:00:00Z'}).report;
assert.equal(PDF.inspect(PDF.build(PDF.formatReport(large,'summary'))).pages,1,'A 1,200-row registration report must summarize without exposing a partial nominal list.');
for(const [label,report]of [['municipios-enxuto',candidate],['cadastros-enxuto',large]]){
  const before=JSON.stringify(report),compact=PDF.formatReport(report,'compact'),bytes=PDF.build(compact),original=PDF.inspect(PDF.build(report)).pages,shorter=PDF.inspect(bytes).pages;
  assert.deepEqual(compact.blocks,report.blocks,'Compact layout must keep all original blocks, rows, labels and values.');
  assert.ok(shorter<original,label+' must reduce paper use without dropping rows.');
  assert.equal(JSON.stringify(report),before);
  if(directory)writeFileSync(directory+'/'+label+'.pdf',bytes);
  console.log(label+': '+original+' → '+shorter+' pages, all rows preserved.');
}
console.log('Report formats passed: six one-page A4 scenarios, 1,200 registrations, complete compact tables, current/historic series, original totals, missing versus zero, source versions, private-name omission and immutable inputs. Synthetic fixtures only.');
