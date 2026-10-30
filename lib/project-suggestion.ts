import type {SolarInput} from './solar';
import {loadConsumption,calculate} from './solar.ts';
import {documentComparison} from './document-comparison.ts';
function growthPercent(base:number,monthly:number){
 const actual=(monthly/base-1)*100,rounded=Math.round((actual+Number.EPSILON)*100)/100;
 return rounded>-100?rounded:actual;
}
export function editProjectSuggestion(p:SolarInput,change:Partial<NonNullable<SolarInput['generationSuggestion']>>):SolarInput|null{
 const current=projectSuggestion(p),base=change.baseMonthlyKwh??current.baseMonthlyKwh;
 if(base===null||!Number.isFinite(base)||base<1||base>1e7)return null;
 const round=(v:number)=>Math.round((v+Number.EPSILON)*100)/100;
 const monthly=change.monthlyKwh??(change.baseMonthlyKwh!==undefined||change.reservePct!==undefined?round(base*(1+(change.reservePct??current.reservePct)/100)):current.monthlyKwh??round(base*(1+current.reservePct/100)));
 if(!Number.isFinite(monthly)||monthly<1||monthly>1e7)return null;
 const reserve=change.monthlyKwh!==undefined?growthPercent(base,monthly):change.reservePct??current.reservePct;
 if(!Number.isFinite(reserve)||reserve<=-100||reserve>1e9)return null;
 return {...p,sizingBasis:change.baseMonthlyKwh!==undefined?'manual':p.sizingBasis,generationSuggestion:{baseMonthlyKwh:base,monthlyKwh:monthly,reservePct:reserve,source:change.source??(change.baseMonthlyKwh!==undefined?'Base de consumo manual informada; conferir histórico e novas cargas.':current.source)}};
}
export function applyProjectSuggestion(p:SolarInput,s:{baseMonthlyKwh:number;monthlyKwh:number;reservePct:number;source:string}):SolarInput{
 const next:SolarInput={...p,generationSuggestion:s,consumption:s.baseMonthlyKwh,consumptionScenario:'project',detailedConsumption:false,useLoadConsumption:false,autoTarget:false,target:s.monthlyKwh,reservePct:s.reservePct,manualModules:0,referenceMode:false,comparisonBasis:'annual',analysisView:'projection',hspConfirmed:false,costsConfirmed:false};
 const previous=calculate(p),proposed=calculate(next);
 if(p.pricing==='kit')next.kitCost=p.kitCost*proposed.modules/previous.modules;
 if(proposed.kwp/p.inverterKw>1.4){next.inverterKw=Math.ceil(proposed.kwp/1.25*2)/2;if(p.pricing==='components')next.inverterCost=p.inverterCost*next.inverterKw/p.inverterKw;}
 return next;
}
export function projectSuggestion(p:SolarInput,criterion:'average'|'peak'|'last'=p.sizingBasis==='last'||p.sizingBasis==='peak'?p.sizingBasis:'average'){
 if(p.generationSuggestion){const s=p.generationSuggestion,actual=(s.monthlyKwh/s.baseMonthlyKwh-1)*100;return {...s,reservePct:Math.abs(s.reservePct-actual)>.005?growthPercent(s.baseMonthlyKwh,s.monthlyKwh):s.reservePct,manual:true};}
 const before=documentComparison(p).before;
 let baseMonthlyKwh:number|null=null,source='Informe o consumo total; o consumo da rede com solar não representa sozinho a demanda do imóvel.';
 if(p.useLoadConsumption){baseMonthlyKwh=loadConsumption(p.loads);source='Inventário de equipamentos informado; validar uso e potência.';}
 else if(before){const history=before.history.filter(h=>h.kwh>=0).slice().sort((a,b)=>a.period.localeCompare(b.period)).slice(-12);baseMonthlyKwh=criterion==='last'?before.measuredKwh||before.consumption:history.length?(criterion==='peak'?Math.max(...history.map(h=>h.kwh)):history.reduce((s,h)=>s+h.kwh,0)/history.length):before.measuredKwh||before.consumption;source=criterion==='last'?`Última fatura antes do solar, ${before.reference}: consumo do ciclo.`:history.length?`${criterion==='peak'?'Pico':'Média'} de ${history.length} meses disponíveis antes do solar, na fatura ${before.reference}${history.length<12?' (amostra parcial)':''}.`:`Consumo medido antes do solar, fatura ${before.reference}.`;}
 else if(!p.billAnalysis?.hasSolar){baseMonthlyKwh=p.detailedConsumption?p.monthlyConsumption.reduce((s,v)=>s+v,0)/12:p.consumption;source='Consumo total informado no projeto; conferir histórico.';}
 const reservePct=p.reservePct??30;
 return {baseMonthlyKwh,reservePct,monthlyKwh:baseMonthlyKwh===null?null:Math.round(baseMonthlyKwh*(1+reservePct/100)*100)/100,source,manual:false};
}
export function projectSuggestionStatus(p:SolarInput){
 const suggestion=projectSuggestion(p),active=calculate(p);
 const pending=suggestion.monthlyKwh!==null&&suggestion.baseMonthlyKwh!==null&&(Math.abs(suggestion.monthlyKwh-active.target)>.01||Math.abs(suggestion.baseMonthlyKwh-active.avgConsumption)>.01);
 return {suggestion,active,pending};
}
