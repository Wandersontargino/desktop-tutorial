import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {parseBill} from '../lib/bill.ts';
import {DEFAULT_INPUT,calculate} from '../lib/solar.ts';
import {inputSchema} from '../lib/validation.ts';
import {buildProjectFromBill,costComparison,fullDocument,recentHistory} from '../lib/client-project.ts';
import {createClientAndProject} from '../lib/bill-import-server.ts';
const solarText=`GRUPO DE TENSAO: B SUBGRUPO: B1 TIPO DE FORNECIMENTO: TRIFASICO
CLASSIFICACAO: RESIDENCIAL PLENO
CLIENTE FICTICIO SOLAR
CPF: ***.111.11*-**
RUA DE TESTE, 1
CEP: 00000-000 - MUNICIPIO FICTICIO - PA
23/07/2026  24/08/2026  32  23/09/2026
9.999.888.777-66
08/2026  01/09/2026  R$ 860,00
Consumo (kWh)  700  1,000000  0,800000  0,00  0,00  700,00
Consumo Compensado (kWh)  1300  0,900000  0,750000  0,00  0,00  1170,00
Energia Ativa Injetada (kWh)  1300  0,900000  0,750000  0,00  0,00  -1170,00
Adicional Bandeira  0,00  0,00  20,00
Cip-Ilum Pub Pref Munic  140,00
As principais informacoes constam no Oficio 241.
C OUT/25  1800
1400
k 1900
W NOV/25  1500
h 2100
DEZ/25  1600
Saldo de creditos expirados no ciclo: 0 kWh
99999999999 Consumo ATIVO TOTAL 10.000 12.000 1,00 2.000 kWh
99999999999 Energia Injetada ATIVO TOTAL 5.000 6.300 1,00 1.300 kWh`;
const options={phone:'',email:'',city:'Cidade fictícia • PA',useHistory:true,reservePct:20,criticalMonth:true,labor:110,margin:25,year:2026,simulation:true};
const bill=()=>parseBill(solarText);
const project=()=>buildProjectFromBill(bill(),solarText,'conta-ficticia.pdf',options);
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE solar_records(id TEXT PRIMARY KEY,owner_id TEXT,kind TEXT,payload TEXT,revision INTEGER,created_at TEXT,updated_at TEXT)');
 class Statement{constructor(query){this.query=query;this.values=[];}bind(...values){this.values=values;return this;}async first(){return sql.prepare(this.query).get(...this.values)||null;}async all(){return {results:sql.prepare(this.query).all(...this.values)};}run(){return {meta:sql.prepare(this.query).run(...this.values)};}}
 return {sql,prepare:q=>new Statement(q),batch:async statements=>{sql.exec('BEGIN');try{const results=statements.map(s=>s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
}
test('conta com solar conserva consumo, compensação e cobrança, sem confundir injeção com geração',()=>{
 const b=bill();assert.equal(b.hasSolar,true);assert.equal(b.consumerUnit,'9.999.888.777-66');assert.equal(b.consumption,2000);assert.equal(b.solar.injected,1300);assert.equal(b.solar.compensated,1300);assert.equal(b.solar.billedConsumption,700);assert.equal(b.solar.compensationDebit+b.solar.injectionCredit,0);assert.equal(b.lighting,140);assert.equal(b.reconciledTotal,b.total);assert.equal(b.solar.currentBalance,null);assert.equal(b.solar.expiredCredits,0);assert.equal(b.fioB,0);assert.equal(b.dueDate,'01/09/2026');assert.equal(b.solar.meterReadings.length,2);
 assert.deepEqual(b.solar.history.map(h=>[h.period,h.gridKwh,h.injectedKwh]),[['2025-10',1800,1400],['2025-11',1900,1500],['2025-12',2100,1600]]);
});
test('projeto de ampliação usa a demanda remanescente da amostra e preserva as três leituras',()=>{
 const bills=[bill(),bill(),bill()];[300,700,1100].forEach((k,i)=>{bills[i].reference=['04/2026','06/2026','08/2026'][i];bills[i].solar.billedConsumption=k;});
 const p=buildProjectFromBill(bills[2],solarText,'tres-contas.pdf',{...options,bills}),c=calculate(p);
 assert.equal(p.projectMode,'expansion');assert.equal(p.isSimulation,true);assert.equal(p.billAnalyses.length,3);assert.equal(c.avgConsumption,700);assert.equal(p.monthlyConsumption[3],300);assert.equal(p.monthlyConsumption[7],1100);assert.equal(p.monthlyConsumption[0],700);assert.equal(p.existingGenerationMonthly,0);assert.equal(p.selfUse,0);assert.equal(inputSchema.safeParse(p).success,true);assert.ok(c.generation.every((g,i)=>g>=c.consumption[i]*1.2));
});
test('novo projeto não herda dados de outro cliente e exige dados reais mínimos',()=>{
 const p=project();assert.equal(p.clientId,'');assert.equal(p.loads.length,0);assert.equal(p.costsConfirmed,false);assert.equal(p.tariffConfirmed,false);assert.equal(p.hspConfirmed,false);assert.throws(()=>buildProjectFromBill({...bill(),consumption:0},'', '',options),/consumo/);assert.throws(()=>buildProjectFromBill({...bill(),client:''},'', '',options),/titular/);assert.equal(fullDocument('***.111.11*-**'),'');
 assert.deepEqual(recentHistory({...bill(),history:[{period:'2026-01',kwh:100}]}),[]);
});
test('comparação separa manutenção e parcelas e sinaliza Fio B ausente',()=>{
 const p=project(),x=costComparison(p);
 assert.equal(x.pendingFio,true);assert.equal(x.lighting,140);assert.equal(x.otherFixed,20);assert.ok(Math.abs(x.totalCash-x.averageAfter-x.maintenance)<1e-8);assert.ok(Math.abs(x.totalFinanced-x.totalCash-x.installment)<1e-8);assert.equal(costComparison({...p,fioB:.25}).pendingFio,false);assert.ok(calculate(p).warnings.some(w=>w.includes('limite superior')));
});
test('importação grava cliente e projeto atomicamente, confirma vínculo e evita repetição',async()=>{
 const db=database(),id=crypto.randomUUID();const first=await createClientAndProject(db,'owner-a',id,project()),again=await createClientAndProject(db,'owner-a',id,project());
 assert.equal(first.client.kind,'client');assert.equal(first.proposal.data.clientId,first.client.id);assert.equal(first.proposal.data.status,'Rascunho');assert.equal(first.reusedClient,false);assert.equal(again.replayed,true);assert.equal(first.proposal.id,again.proposal.id);assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM solar_records').get().n,2);
});
test('nova conta da mesma unidade reutiliza o perfil sem sobrescrever o contato',async()=>{
 const db=database(),p=project();p.phone='Contato original';const first=await createClientAndProject(db,'owner-a',crypto.randomUUID(),p);const second=await createClientAndProject(db,'owner-a',crypto.randomUUID(),{...project(),phone:'Outro contato'});
 assert.equal(first.client.id,second.client.id);assert.equal(second.client.data.phone,'Contato original');assert.equal(second.reusedClient,true);assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM solar_records').get().n,3);
});
test('mesma unidade em contas de usuários diferentes não expõe nem reutiliza dados',async()=>{
 const db=database();const a=await createClientAndProject(db,'owner-a',crypto.randomUUID(),project()),b=await createClientAndProject(db,'owner-b',crypto.randomUUID(),project());assert.notEqual(a.client.id,b.client.id);assert.notEqual(a.proposal.id,b.proposal.id);
});
test('conflito de CPF/CNPJ da unidade e leitura não conferida são rejeitados',async()=>{
 const db=database(),p={...project(),document:'111.111.111-11'};await createClientAndProject(db,'owner-a',crypto.randomUUID(),p);
 await assert.rejects(createClientAndProject(db,'owner-a',crypto.randomUUID(),{...p,document:'222.222.222-22'}),/outro CPF/);assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM solar_records').get().n,2);
 await assert.rejects(createClientAndProject(db,'owner-a',crypto.randomUUID(),{...p,billReviewed:false}),/leitura/);
});
test('falha na gravação do projeto desfaz o perfil novo',async()=>{
 const db=database();db.sql.exec("CREATE TRIGGER reject_proposal BEFORE INSERT ON solar_records WHEN NEW.kind='proposal' BEGIN SELECT RAISE(ABORT,'failure'); END");
 await assert.rejects(createClientAndProject(db,'owner-a',crypto.randomUUID(),project()),/failure/);assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM solar_records').get().n,0);
});
