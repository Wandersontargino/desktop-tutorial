import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import M from '../public/crossing-model.js';
import P from '../public/paired-analysis.js';
import PDF from '../public/report-pdf.js';

const slots=[{office:'estadual',candidate:['e','12345','CANDIDATURA ESTADUAL DE TESTE']},{office:'federal',candidate:['f','1234','CANDIDATURA FEDERAL DE TESTE']}];
const row=(section,e,f,extra={})=>({key:P.sectionKey('100',1,section),code:'100',city:'MUNICÍPIO DE TESTE',zone:'1',section:String(section),place:'ESCOLA DE TESTE',neighborhood:'CENTRO',e,f,registered:2,locationConflict:false,...extra});
const rows=[row(1,0,0),row(2,0,5),row(3,7,0),row(4,0,null),row(5,0,0,{locationConflict:true}),row(6,4,6)];
const registry={total:12,eligible:12,pending:0,repeated:0,conflicting:0,sections:rows};
const evaluate=(joined=rows,extra={})=>M.evaluate({projected:[[],[]],joined,slots,registry,registryMode:true,...extra});
// Conflict is excluded from registered counting in CRM mode, but remains a
// coverage warning in vote-only analysis. Missing voting data is never zero.
const result=evaluate(rows,{registryMode:false}),before=JSON.stringify(result),alerts=M.sectionAlerts(result);
assert.deepEqual(alerts.zero.map(r=>r.section),['0001','0002','0003']);
assert.deepEqual(alerts.zero.map(r=>r.status.label),['Sem votos para C1 e C2','Sem votos para C1','Sem votos para C2']);
assert.deepEqual(alerts.missing.map(r=>r.section),['0004','0005']);
assert.ok(alerts.missing.every(r=>r.status.kind==='missing'));
assert.equal(alerts.missing[1].status.label,'Local divergente; conferir');
const block=M.table(result,'section');
assert.deepEqual(block.rowStatus.map(s=>s.kind),['zero','zero','zero','missing','missing','normal']);
assert.ok(block.rowColors[0]&&block.rowColors[3]&&block.rowColors[0]!==block.rowColors[3]);
const report=M.sectionReport(result,{scope:'Município de teste',sources:['Fonte de teste • v1']});
assert.deepEqual(report.blocks.map(b=>b.rows.length),[3,2]);
assert.ok(report.blocks[1].rows[0].includes('Sem cobertura'));
assert.ok(report.note.includes('não identificam o voto'));
assert.ok(PDF.inspect(PDF.build(report)).pages>0);
assert.equal(JSON.stringify(result),before);

const registered=evaluate(rows.slice(0,4),{registry:{...registry,total:8,eligible:8,sections:rows.slice(0,4)}});
assert.equal(M.sectionReport(registered).indicators.find(i=>i.label==='Cadastros nessas seções').value,'6');
assert.equal(M.sectionAlerts(registered).missing.length,1);
const oneZoneTwoCities=[row(1,0,1),row(1,0,1,{code:'200',city:'OUTRO MUNICÍPIO',key:P.sectionKey('200',1,1)})];
assert.equal(M.sectionAlerts(evaluate(oneZoneTwoCities,{registryMode:false,filters:{cities:['100']}})).zero.length,1);
const offset=evaluate([row(1,0,10),row(2,10,0)],{registryMode:false});
assert.equal(M.table(offset,'municipality').rowStatus[0].kind,'zero','Positive totals in different sections do not create a positive section ceiling.');
for(const pair of [[slots[0],{...slots[1],office:'estadual'}],[slots[0],null]]){
  const value=evaluate(rows,{slots:pair,registryMode:false});
  assert.deepEqual(M.sectionAlerts(value),{zero:[],missing:[]});
  assert.ok(M.table(value,'section').rowStatus.every(s=>s.kind==='normal'));
  assert.throws(()=>M.sectionReport(value),/estadual e um federal/);
}
const contaminated=evaluate([row(1,0,0,{name:'NOME PRIVADO PROIBIDO NO RELATÓRIO',title:'TÍTULO PRIVADO',phone:'TELEFONE PRIVADO'})],{registryMode:false});
assert.ok(!JSON.stringify(M.sectionAlerts(contaminated)).includes('PRIVADO'));
assert.ok(!JSON.stringify(M.sectionReport(contaminated)).includes('PRIVADO'));
const large=evaluate(Array.from({length:301},(_,i)=>row(i+1,0,1)),{registryMode:false});
const largeReport=M.sectionReport(large);assert.equal(largeReport.blocks[0].rows.length,301);
assert.ok(largeReport.blocks[0].rows.some(r=>r.includes('0301')));assert.ok(PDF.inspect(PDF.build(largeReport)).pages>1);
if(process.argv[2])writeFileSync(process.argv[2],PDF.build({...report,generatedAt:'18/10/2026, 07:23:04'}));
console.log('Aggregate section alerts passed: zero vs missing, conflicting locations, independent municipalities, per-section ceilings, no individual identities or inferred preferences, all 301 exported rows, and retained filters/cargo rules.');
