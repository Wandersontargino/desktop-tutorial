import test from 'node:test';
import assert from 'node:assert/strict';
import {ordinaryResidentialTariffs} from '../lib/official-energy-tariff.ts';
test('tarifa integral exclui SCEE, desconto social, outra classe e vigência vencida, sem duplicar linhas',()=>{
 const row={SigAgente:'EQUATORIAL PA',DscSubGrupo:'B1',DscModalidadeTarifaria:'Convencional',DscBaseTarifaria:'Tarifa de Aplicação',DscClasse:'Residencial',DscSubClasse:'Residencial',DscDetalhe:'Não se aplica',DscUnidadeTerciaria:'MWh',DatInicioVigencia:'2026-09-18',DatFimVigencia:'2027-08-06',VlrTUSD:'700,00',VlrTE:'280,00'};
 const rows=[row,{...row},{...row,DscDetalhe:'SCEE',VlrTE:'-14,00'},{...row,DscSubClasse:'Residencial Desconto Social'},{...row,SigAgente:'OUTRA'},{...row,DatFimVigencia:'2026-10-01'},{...row,DscSubGrupo:'B3'},{...row,VlrTE:'inválido'}];
 assert.deepEqual(ordinaryResidentialTariffs(rows,'Equatorial Pará','2026-10-30'),[row]);
});
