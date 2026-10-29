import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import M from '../public/crossing-model.js';
import P from '../public/paired-analysis.js';
import PDF from '../public/report-pdf.js';

const slots=[{office:'estadual',candidate:['e','12345','CANDIDATO ESTADUAL DE TESTE']},{office:'federal',candidate:['f','1234','CANDIDATO FEDERAL DE TESTE']}];
const rows=Array.from({length:400},(_,i)=>{const code=String(100+Math.floor(i/40)),section=String(i%40+1),zone=String(i%2+1);return {key:P.sectionKey(code,zone,section),code,city:'MUNICÍPIO '+code,zone,section,place:'ESCOLA '+Math.floor(i%40/4+1),neighborhood:'BAIRRO '+(i%2+1),e:i%5,f:i%7,registered:1,locationConflict:false};});
const result=M.evaluate({projected:[[],[]],joined:rows,slots}),options={scope:'10 municípios de teste',filterLabel:'Recorte da consulta de teste',sources:['Fonte estadual • v1','Fonte federal • v2']},before=JSON.stringify(result);
for(const [unit,title]of Object.entries(M.reportUnits)){
  const report=M.selectedReport(result,[unit],options),original=M.table(result,unit);
  assert.deepEqual(report.blocks.map(b=>b.title),[title]);assert.deepEqual(report.blocks[0].rows,original.rows);assert.deepEqual(report.blocks[0].rowColors,original.rowColors);
  assert.ok(report.meta.some(([label,value])=>label==='Conteúdo do PDF'&&value===title));
  assert.ok(report.meta.some(([label,value])=>label==='Filtros'&&value===options.filterLabel));
  assert.ok(report.meta.some(([label,value])=>label==='Fonte do candidato 2'&&value===options.sources[1]));
  assert.deepEqual(report.indicators,M.report(result,options).indicators);
  assert.ok(report.subtitle.includes('C1: Estadual • 12345'));assert.ok(report.subtitle.includes('C2: Federal • 1234'));
  assert.equal(report.blocks[0].headers.includes(M.name(slots[0])),false,'Long identities belong in the legend, not repeated table headers.');
  assert.ok(PDF.inspect(PDF.build(report)).pages>0);
}
const cities=M.selectedReport(result,['municipality'],options),combined=M.selectedReport(result,['zone','municipality','zone'],options),full=M.report(result,options);
assert.deepEqual(combined.blocks.map(b=>b.title),['Municípios','Zonas']);
assert.ok(PDF.inspect(PDF.build(cities)).pages<PDF.inspect(PDF.build(full)).pages,'Selecting municipalities must exclude school/section/neighborhood pages.');
assert.equal(cities.blocks[0].rows.length,10);assert.equal(JSON.stringify(result),before);
for(const selection of [[],null,['invalid'],['__proto__']])assert.throws(()=>M.selectedReport(result,selection),/Selecione|inválido/);
const filtered=M.evaluate({projected:[[],[]],joined:rows,slots,filters:{cities:['100'],zone:'1'}});
assert.equal(M.selectedReport(filtered,['municipality'],options).blocks[0].rows.length,1);
assert.equal(M.selectedReport(filtered,['zone'],options).blocks[0].rows.length,1);
assert.equal(M.selectedReport(filtered,['section'],options).blocks[0].rows.length,20);
const registry={total:400,eligible:400,pending:0,repeated:0,conflicting:0,sections:rows},registered=M.evaluate({projected:[[],[]],joined:rows,slots,registry,registryMode:true});
const privateReport=M.selectedReport(registered,['place'],{...options,registryGroups:[{leadership:'LIDERANÇA SELECIONADA',total:400,eligible:400,pending:0,registered:400}]});
assert.deepEqual(privateReport.blocks.map(b=>b.title),['Locais de votação']);assert.ok(privateReport.blocks[0].headers.includes('Cadastros'));assert.deepEqual(privateReport.dashboard,M.reach(registered));
for(const pair of [[slots[0],{...slots[1],office:'estadual'}],[null,slots[1]]]){
  const r=M.evaluate({projected:[[],[]],joined:rows,slots:pair}),report=M.selectedReport(r,['municipality'],options);
  assert.ok(!report.blocks[0].headers.includes('Teto por seção'));if(!pair[0])assert.deepEqual(report.blocks[0].headers,['Território','Votos C2']);
}
if(process.argv[2])writeFileSync(process.argv[2],PDF.build({...cities,generatedAt:'18/10/2026, 08:55:35'}));
console.log('Selected report passed: every unit alone, combinations and duplicate choices, exact rows/colors/totals/filters/sources, no unselected tables or leadership pages, valid same-office/individual queries, and fewer PDF pages.');
