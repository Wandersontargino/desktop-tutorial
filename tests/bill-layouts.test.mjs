import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBill} from '../lib/bill.ts';
import {billEvidence} from '../lib/bill-evidence.ts';
import {selectOfficialFioB,observedFioBTaxEstimate} from '../lib/official-fio-b.ts';
import {DEFAULT_INPUT} from '../lib/solar.ts';
import {readFileSync} from 'node:fs';
const legacy=`Equatorial Pará
Classificação: Residencial Pleno   Tipo de Fornecimento: TRIFÁSICO
CLIENTE DE EXEMPLO   Leituras   01/10/2024   01/11/2024   31   01/12/2024
INSTALAÇÃO: 7812345   Parceiro de Negócio
CPF: ***.111.11*-**
NOTA FISCAL Nº 100000000
RUA EXEMPLO , 10
- ANANINDEUA - PA   Conta Contrato
PERDAS DE TRANSFORMAÇÃO / RAMAL: 6
3000000001
Conta Mês   Vencimento   Total a Pagar   Protocolo de autorização: 3152400099999999 -
01/11/2024 às 14:18:01
10/2024   10/11/2024   R$ 1.250,75
Consumo (kWh)   1.000   1,100000   0,800000   0,00   0,00   1.100,00
Cip-Ilum Pub Pref Munic   150,75
Medidor Grandeza Posto Horário Leitura Anterior Atual
31010000000 Consumo ATIVO TOTAL 90.000 91.000 1,00 1.000 kWh
NOME DO PAGADOR/CPF/CNPJ/ENDEREÇO
CLIENTE DE EXEMPLO 111.222.333-44`;
const solar=`Titular: Cliente Solar Fictício
Unidade consumidora: 1234567890
Referência: 04/2026
Consumo (kWh)   500   1,200000   0,900000   0,00   0,00   600,00
Consumo Compensado (kWh)   700   1,000000   0,750000   0,00   0,00   700,00
Energia Ativa Injetada (kWh)   700   1,000000   0,750000   0,00   0,00   -700,00
Cip-Ilum Pub Pref Munic   50,00
Total a pagar R$ 650,00`;
test('fatura antiga não confunde protocolo, CPF do boleto, instalação e titular',()=>{
 const b=parseBill(legacy);assert.equal(b.total,1250.75);assert.equal(b.client,'CLIENTE DE EXEMPLO');assert.equal(b.consumerUnit,'7812345');assert.equal(b.accountCode,'3000000001');assert.equal(b.document,'***.111.11*-**');assert.equal(b.reference,'10/2024');assert.equal(b.reconciliationDifference,0);assert.equal(b.consumption,1000);assert.ok(b.address.includes('ANANINDEUA'));
});
test('protocolo ao lado do título não vira valor monetário quando o total está ausente',()=>{
 const b=parseBill('Total a Pagar   Protocolo de autorização: 3152400099999999 -\nTitular: Cliente Fictício\nConsumo: 1000 kWh');assert.equal(b.total,0);
});
test('compensação e crédito que se anulam não permitem deduzir tarifa ou isenção de Fio B',()=>{
 const b=parseBill(solar),e=billEvidence(b);assert.equal(b.fioB,0);assert.equal(e.settlement,0);assert.equal(e.gridCharge,null);assert.equal(b.reconciliationDifference,0);assert.ok(e.explanation.includes('não comprova isenção'));
});
test('lançamento GD2 é valor observado, não componente integral a multiplicar novamente',()=>{
 const b=parseBill(solar.replace('R$ 650,00','R$ 750,00')+'\nParc. Inj. S/ Desc. - GD2 (kWh)   500   0,200000   0,150000   0,00   0,00   100,00'),e=billEvidence(b);
 assert.equal(e.gridCharge,100);assert.equal(b.fioB,0);assert.equal(b.reconciliationDifference,0);assert.ok(e.explanation.includes('nem multiplicado novamente'));
});
test('cabeçalho em imagem permite referência pelo arquivo e UF, sinalizada para conferência',()=>{
 const b=parseBill('Titular: Cliente Fictício\nEndereço: Rua Exemplo - ANANINDEUA - PA\nConsumo: 1000 kWh\nTotal a pagar R$ 1.000,00','EQUATORIAL - 11-2026.pdf');assert.equal(b.distributor,'Equatorial Pará');assert.ok(b.notes.some(n=>n.includes('nome do arquivo')));
 assert.equal(parseBill('Titular: Cliente Fictício\nConsumo: 1000 kWh').distributor,'');
});
test('componente oficial respeita agente, classe, vigência, unidade e conversão MWh para kWh',()=>{
 const snapshot=JSON.parse(readFileSync(new URL('../lib/data/fio-b-equatorial-pa-2026.json',import.meta.url))),ref=selectOfficialFioB(snapshot.records,'Equatorial Pará','B1','2026-10-29');
 assert.ok(ref);assert.equal(ref.net,.379352320561);assert.equal(ref.start,'2026-09-18');assert.equal(selectOfficialFioB(snapshot.records,'Equatorial Maranhão','B1','2026-10-29'),null);assert.equal(selectOfficialFioB(snapshot.records,'Equatorial Pará','B1','2026-04-01'),null);assert.ok(selectOfficialFioB(snapshot.records,'Equatorial Pará','B1','2026-10-29',true));
 const changed=structuredClone(snapshot.records);changed.push({...changed[0],VlrComponenteTarifario:'999,99'});assert.equal(selectOfficialFioB(changed,'Equatorial Pará','B1','2026-10-29'),null);
});
test('estimativa com tributos usa fator da própria fatura e não altera sua leitura ou aplica percentual duas vezes',()=>{
 const bill=parseBill(solar),p={...structuredClone(DEFAULT_INPUT),billAnalysis:bill},ref={net:.3};
 const estimate=observedFioBTaxEstimate(p,ref);assert.equal(estimate.gross,.4);assert.equal(bill.fioB,0);assert.equal(ref.net,.3);assert.equal(observedFioBTaxEstimate({...p,billAnalysis:null},ref),null);
});
