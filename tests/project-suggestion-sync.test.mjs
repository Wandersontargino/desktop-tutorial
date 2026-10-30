import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_INPUT,calculate} from '../lib/solar.ts';
import {editProjectSuggestion,applyProjectSuggestion,projectSuggestion} from '../lib/project-suggestion.ts';
import {inputSchema} from '../lib/validation.ts';
const input=(x={})=>({...structuredClone(DEFAULT_INPUT),...x});

test('editar kWh atualiza margem; editar margem recalcula kWh sem alterar o cenário ativo',()=>{
 const p=input(),goal=editProjectSuggestion(p,{monthlyKwh:1600});
 assert.equal(goal.generationSuggestion.reservePct,60);assert.equal(goal.generationSuggestion.monthlyKwh,1600);
 const margin=editProjectSuggestion(goal,{reservePct:25});
 assert.equal(margin.generationSuggestion.monthlyKwh,1250);assert.equal(margin.generationSuggestion.reservePct,25);
 assert.equal(calculate(margin).target,calculate(p).target);
 assert.equal(calculate(applyProjectSuggestion(margin,margin.generationSuggestion)).target,1250);
});
test('base decimal conserva precisão e alterar só a justificativa não muda a meta manual',()=>{
 const base=editProjectSuggestion(input(),{baseMonthlyKwh:777.125}),goal=editProjectSuggestion(base,{monthlyKwh:1000});
 const source=editProjectSuggestion(goal,{source:'Justificativa de teste'});
 assert.equal(source.generationSuggestion.baseMonthlyKwh,777.125);assert.equal(source.generationSuggestion.monthlyKwh,1000);
 assert.equal(source.generationSuggestion.reservePct,28.68);
 assert.equal(editProjectSuggestion(source,{reservePct:0}).generationSuggestion.monthlyKwh,777.13);
 assert.equal(editProjectSuggestion(source,{baseMonthlyKwh:900}).generationSuggestion.monthlyKwh,1158.12);
});
test('metas manuais abaixo da base e acima do dobro têm margem representável e podem ser salvas',()=>{
 for(const [monthlyKwh,reservePct] of [[800,-20],[2500,150]]){
  const p=editProjectSuggestion(input(),{monthlyKwh});assert.equal(p.generationSuggestion.reservePct,reservePct);
  const applied=applyProjectSuggestion(p,p.generationSuggestion);
  assert.equal(calculate(applied).target,monthlyKwh);assert.equal(inputSchema.safeParse(applied).success,true);
 }
 assert.equal(inputSchema.safeParse(input({autoTarget:true,reservePct:-20})).success,false);
 assert.equal(editProjectSuggestion(input(),{baseMonthlyKwh:0}),null);
 assert.equal(editProjectSuggestion(input(),{reservePct:-100}),null);
 assert.equal(editProjectSuggestion(input(),{monthlyKwh:Infinity}),null);
});
test('sugestão antiga incoerente mostra a margem da meta sem modificar o registro de origem',()=>{
 const p=input({generationSuggestion:{baseMonthlyKwh:1000,monthlyKwh:1600,reservePct:30,source:'Exemplo antigo'}});
 assert.equal(projectSuggestion(p).reservePct,60);assert.equal(p.generationSuggestion.reservePct,30);
});
