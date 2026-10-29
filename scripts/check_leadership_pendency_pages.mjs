import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {assessRecords} from '../lib/crm-model.mjs';
import {buildLeadershipPendencyReport} from '../lib/leadership-pendency-report.mjs';
import {twentyRecords,syntheticTitle,reportLocations} from './fixtures/registration-report.mjs';
import PDF from '../public/report-pdf.js';
const seed=twentyRecords(),base=seed[0],raw=[
 ...seed.map(r=>({...r,leadership:'LIDERANÇA ALFA',coordinator:'COORDENADOR A'})),
 ...Array.from({length:80},(_,i)=>({...base,id:'long-'+i,title:syntheticTitle(100+i),name:'PESSOA LONGA'+String(i).padStart(3,'0'),leadership:'LIDERANÇA LONGA',coordinator:'COORDENADOR B',mother:'',contact:''})),
 ...Array.from({length:2},(_,i)=>({...base,id:'complete-'+i,title:syntheticTitle(200+i),name:'SEM PENDENCIA '+i,leadership:'LIDERANÇA SEM PENDÊNCIA',coordinator:'COORDENADOR C'})),
 ...Array.from({length:3},(_,i)=>({...base,id:'outside-'+i,title:syntheticTitle(220+i),name:'PESSOA OUTRA'+i,leadership:'LIDERANÇA OUTRA',coordinator:'COORDENADOR A',section:''})),
 {...base,id:'archived',name:'ARQUIVADO NÃO INCLUIR',deleted:true,title:syntheticTitle(250),section:''}
];
const records=assessRecords(raw,reportLocations),original=JSON.stringify(records),user={role:'owner'};
const result=buildLeadershipPendencyReport(records,{user,leadership:'LIDERANÇA OUTRA',search:'NO MATCH',generatedAt:'2026-10-22T23:00:00Z',revision:42,pendingChanges:2,online:false});
assert.deepEqual([result.total,result.selectedCount,result.unlocated,result.groups.length],[105,91,4,3]);
assert.equal(result.report.layout,'leadership-pages');const tables=result.report.blocks.filter(b=>b.type==='table');assert.deepEqual(tables.map(b=>b.pageBreakBefore),[false,true,true]);assert.equal(tables.reduce((sum,b)=>sum+b.rows.length,0),91);assert.ok(!JSON.stringify(tables).includes('LIDERANÇA SEM PENDÊNCIA'));assert.ok(!JSON.stringify(tables).includes('ARQUIVADO NÃO INCLUIR'));
assert.ok(result.report.meta.some(r=>r[1].includes('Revisão 42')&&r[1].includes('offline')&&r[1].includes('2 edições')));
for(const [mode,count,groups]of [['primary',5,2],['secondary',86,2],['unlocated',4,2]]){const value=buildLeadershipPendencyReport(records,{user,mode});assert.equal(value.selectedCount,count);assert.equal(value.groups.length,groups);if(mode==='unlocated')assert.ok(value.report.blocks.filter(b=>b.rows).every(b=>b.rows.every(row=>row[3]==='Não contabilizado')));}
const primary=buildLeadershipPendencyReport(records,{user,mode:'primary'});assert.ok(primary.report.blocks.flatMap(b=>b.rows||[]).some(row=>row[3]==='Local confirmado'),'A title error does not imply an unconfirmed location.');
assert.equal(buildLeadershipPendencyReport(records,{user:{role:'leader',scope:'LIDERANÇA ALFA'}}).selectedCount,8);assert.equal(buildLeadershipPendencyReport(records,{user:{role:'coordinator',scope:'COORDENADOR A'}}).total,23);assert.equal(buildLeadershipPendencyReport(records,{user:{role:'leader',scope:'NO ACCESS'}}).selectedCount,0);assert.throws(()=>buildLeadershipPendencyReport(records,{}),/Desbloqueie/);assert.throws(()=>buildLeadershipPendencyReport(records,{user,mode:'invalid'}),/válido/);assert.throws(()=>PDF.formatReport(result.report,'summary'),/Enxuto/);
for(const format of ['compact','original']){const report=PDF.formatReport(result.report,format),bytes=PDF.build(report);assert.ok(PDF.inspect(bytes).pages>=3);assert.equal(report.blocks.reduce((n,b)=>n+(b.rows?.length||0),0),91);}
assert.equal(JSON.stringify(records),original);mkdirSync('tmp/pdfs',{recursive:true});writeFileSync('tmp/pdfs/leadership-pendencies.pdf',PDF.build(PDF.formatReport(result.report,'compact')));writeFileSync('tmp/pdfs/leadership-pendencies-expectations.json',JSON.stringify({groups:result.groups.map(g=>g.leadership),titles:result.groups.flatMap(g=>g.records.map(r=>r.title))}));
console.log('Leadership batch PDF passed: 105 active / 91 pending / 4 unlocated; all modes, role isolation, filters-independent batch, archived and complete-only omission, protected names, retained rows, explicit page breaks and summary prevention. Synthetic data only.');
