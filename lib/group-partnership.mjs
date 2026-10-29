import {normalize,validTitle,digits,countableForResults} from './crm-model.mjs';
import Paired from '../public/paired-analysis.js';
import {municipalitySummary} from './pendency-report.mjs';

export const groupId=r=>JSON.stringify([normalize(r.coordinator),normalize(r.leadership)]);
export const ALL_LEADERSHIPS='__all_leaderships__';
export function groups(records){
  const map=new Map();
  for(const r of records.filter(r=>!r.deleted)){
    const id=groupId(r);
    if(!map.has(id))map.set(id,{id,leadership:r.leadership,coordinator:r.coordinator,records:[]});
    map.get(id).records.push(r);
  }
  return [...map.values()].sort((a,b)=>a.leadership.localeCompare(b.leadership,'pt-BR')||a.coordinator.localeCompare(b.coordinator,'pt-BR'));
}
// Only public candidate identities and a declared work-group relationship are stored.
export function cleanPartnership(input){
  const text=(value,max)=>String(value||'').trim().slice(0,max);
  const value={year:2026,turn:1,leadership:text(input.leadership,80).replace(/\s+/g,' ').toUpperCase(),coordinator:text(input.coordinator,100).replace(/\s+/g,' ').toUpperCase(),version:Number(input.version)||0};
  if(input.year!==2026||input.turn!==1||!value.leadership||!Number.isSafeInteger(value.version)||value.version<0)throw new Error('Parceria inválida para a eleição de 2026.');
  value.id=groupId(value);
  for(const office of ['estadual','federal']){
    const c=input[office];
    if(!c||!/^\d{1,20}$/.test(String(c.id))||!new RegExp('^\\d{'+(office==='estadual'?5:4)+'}$').test(String(c.number))||!text(c.name,120))throw new Error('Escolha um candidato confirmado de cada cargo.');
    value[office]={id:String(c.id),number:String(c.number),name:text(c.name,120)};
  }
  return value;
}
export function registryScope(records,id){
  const ids=Array.isArray(id)?new Set(id):null;
  const selected=records.filter(r=>!r.deleted&&(id===ALL_LEADERSHIPS||(ids?ids.has(groupId(r)):groupId(r)===id))),byTitle=new Map();
  for(const [index,r] of selected.entries()){
    const title=digits(r.title),key=validTitle(title)?'title:'+title:'record:'+index;
    if(!byTitle.has(key))byTitle.set(key,[]);byTitle.get(key).push(r);
  }
  const sections=new Map(),countedIds=[];let eligible=0,repeated=0,pending=0,conflicting=0,pendingIncluded=0;
  for(const [key,items] of byTitle){
    const verified=items.every(countableForResults);
    const identities=new Set(items.map(r=>JSON.stringify([String(r.location?.cityCode||''),String(Number(r.zone)),String(Number(r.section))])));
    if(!verified||identities.size!==1){pending+=items.length;if(identities.size>1&&key.startsWith('title:'))conflicting+=items.length;continue;}
    if(items.some(r=>r.ready!==true||(r.primaryFlags||[]).length||r.secondaryPending||(r.secondaryFlags||[]).length))pendingIncluded++;
    countedIds.push(...items.map(r=>r.id));repeated+=items.length-1;eligible++;const r=items[0],sectionKey=Paired.sectionKey(r.location.cityCode,r.zone,r.section);
    if(!sections.has(sectionKey))sections.set(sectionKey,{key:sectionKey,code:String(r.location.cityCode),zone:String(Number(r.zone)),section:String(Number(r.section)),city:r.location.city,place:r.location.place,neighborhood:r.location.neighborhood,registered:0});
    sections.get(sectionKey).registered++;
  }
  return {id,total:selected.length,eligible,repeated,pending,conflicting,pendingIncluded,countedIds,municipalities:municipalitySummary(selected).rows.map(({records,...r})=>r),sections:[...sections.values()]};
}
export function registrySelection(records,{mode='all',ids=[],coordinator=''}={}){
  const available=groups(records),wanted=new Set(ids);
  const selected=available.filter(g=>mode==='all'||mode==='manual'&&wanted.has(g.id)||mode==='coordinator'&&coordinator!==''&&normalize(g.coordinator)===coordinator);
  const label=mode==='coordinator'?'Coordenador: '+(selected[0]?.coordinator||'Sem coordenador'):mode==='manual'?'Seleção manual de '+selected.length+' liderança(s)':'Todas as lideranças autorizadas';
  return {groups:selected,ids:selected.map(g=>g.id),label};
}
export function leadershipIndicators(rows){
  const registered=rows.reduce((n,r)=>n+r.registered,0);
  const covered=rows.filter(r=>!r.locationConflict&&Number.isSafeInteger(r.e)&&r.e>=0&&Number.isSafeInteger(r.f)&&r.f>=0);
  const matched=covered.reduce((n,r)=>n+r.registered,0),complete=registered>0&&covered.length===rows.length;
  const ceiling=complete?covered.reduce((n,r)=>n+Math.min(r.registered,r.e,r.f),0):null;
  const weighted=complete?covered.reduce((n,r)=>n+r.registered*(Math.max(r.e,r.f)?Math.min(r.e,r.f)/Math.max(r.e,r.f):0),0)/registered:null;
  const utilization=Paired.registryUtilization(rows);
  return {registered,matched,coverage:registered?matched/registered:null,compatibilityPercent:ceiling===null?null:ceiling/registered,weightedProximity:weighted,outsideCeiling:ceiling===null?null:registered-ceiling,deficitPercent:utilization.deficitRatio};
}
// Overlap is checked only against groups already visible to the signed-in CRM user.
// Shared sections are not evidence that a vote belongs to either leadership.
export function leadershipOverlap(records,registry,rows){
  const selected=new Map(rows.map(r=>[r.key,r])),shared=new Set(),leaders=[];
  for(const g of groups(records)){
    if(g.id===registry.id)continue;
    const scope=registryScope(g.records,g.id),common=scope.sections.filter(r=>selected.has(r.key));
    if(!common.length)continue;
    for(const r of common)shared.add(r.key);
    leaders.push({leadership:g.leadership,coordinator:g.coordinator,sections:common.length,registered:common.reduce((n,r)=>n+r.registered,0)});
  }
  return {sections:shared.size,registered:[...shared].reduce((n,key)=>n+selected.get(key).registered,0),leaders:leaders.sort((a,b)=>b.sections-a.sections||a.leadership.localeCompare(b.leadership,'pt-BR'))};
}
// A scenario is an integer allocation of anonymous group counts. It is never an
// inferred voter preference. The construction satisfies each section's available
// candidate counts; turnout/electorate constraints are not integrated here.
export function simulatePartnership(analysis,input){
  const n=analysis.registered,keys=['both','onlyState','onlyFederal'],values=keys.map(k=>input[k]);
  const fail=message=>({ok:false,total:n,message});
  if(!n||analysis.missing||analysis.rows.some(r=>!Number.isSafeInteger(r.e)||r.e<0||!Number.isSafeInteger(r.f)||r.f<0||r.locationConflict))return fail('O cenário exige votação e localização completas nos dois cargos para todo o recorte.');
  if(values.some(v=>!Number.isSafeInteger(v)||v<0))return fail('Preencha as três hipóteses com quantidades inteiras, a partir de zero.');
  const [both,onlyState,onlyFederal]=values;
  if(values.some(v=>v>n)||both+onlyState+onlyFederal>n)return fail('A soma das hipóteses não pode ultrapassar os '+n+' cadastros únicos do recorte.');
  const rows=analysis.rows.map(r=>({...r,a:Math.min(r.registered,r.e),c:Math.min(r.registered,r.f),both:0,onlyState:0,onlyFederal:0})).sort((a,b)=>a.key.localeCompare(b.key));
  const maximum=rows.reduce((v,r)=>v+Math.min(r.a,r.c),0),state=rows.reduce((v,r)=>v+r.a,0),federal=rows.reduce((v,r)=>v+r.c,0);
  if(both>maximum)return fail('A hipótese de voto nos dois ultrapassa o teto de '+maximum+' cadastros, calculado seção por seção.');
  if(both+onlyState>state)return fail('Dupla + somente estadual ultrapassa o limite de '+state+' cadastros compatíveis com os votos estaduais nas mesmas seções.');
  if(both+onlyFederal>federal)return fail('Dupla + somente federal ultrapassa o limite de '+federal+' cadastros compatíveis com os votos federais nas mesmas seções.');
  const cheap=rows.reduce((v,r)=>v+Math.max(0,r.a+r.c-r.registered),0),union=rows.reduce((v,r)=>v+Math.min(r.registered,r.a+r.c),0)-both-Math.max(0,both-cheap);
  if(onlyState+onlyFederal>union)return fail('Essas hipóteses exigem votos em seções diferentes das disponíveis. Reduza as quantidades: os totais gerais não compensam uma falta de votos na mesma seção.');
  const allocate=(amount,field,capacity)=>{let remaining=amount;for(const row of rows){const take=Math.min(remaining,Math.max(0,capacity(row)));row[field]+=take;remaining-=take;}return remaining;};
  let remaining=allocate(both,'both',r=>Math.max(0,r.a+r.c-r.registered));
  allocate(remaining,'both',r=>Math.min(r.a,r.c)-r.both);
  remaining=allocate(onlyState,'onlyState',r=>Math.min(r.a-r.both,r.registered-r.c));
  allocate(remaining,'onlyState',r=>r.a-r.both-r.onlyState);
  remaining=allocate(onlyFederal,'onlyFederal',r=>Math.min(r.c-r.both,r.registered-r.both-r.onlyState));
  if(remaining)throw new Error('Não foi possível construir o cenário por seção.');
  const neither=n-both-onlyState-onlyFederal;
  return {ok:true,total:n,both,onlyState,onlyFederal,neither,maximum,rows:rows.map(({a,c,...r})=>({...r,neither:r.registered-r.both-r.onlyState-r.onlyFederal})),percentages:{both:both/n,onlyState:onlyState/n,onlyFederal:onlyFederal/n,neither:neither/n}};
}
export function analyzeRegistry(registry,voteRows,filters={},turnout=null){
  const allowed=registry.sections.filter(r=>(!filters.city||r.code===filters.city)&&(!filters.zone||r.zone===filters.zone)&&(!filters.place||Paired.placeKey(r)===filters.place));
  const byKey=new Map(voteRows.map(r=>[r.key,r]));
  const rows=allowed.map(r=>{
    const votes=byKey.get(r.key),location=!!votes&&Paired.placeVerified(votes)&&normalize(votes.place)===normalize(r.place)&&normalize(votes.neighborhood)===normalize(r.neighborhood);
    const count=value=>location&&Number.isSafeInteger(value)&&value>=0?value:null;
    const row={...r,e:count(votes?.e),f:count(votes?.f),te:count(votes?.te),tf:count(votes?.tf),locationConflict:!location};
    const m=Paired.metrics([row]),c=Paired.counts([row]);
    const n=turnout?.[row.key],validN=Number.isSafeInteger(n)&&n>=0&&row.e!==null&&row.f!==null&&n>=Math.max(row.e,row.f,row.te,row.tf);
    return {...row,...c,registryUpper:c.upper==null?null:Math.min(row.registered,c.upper),lower:validN?Math.max(0,row.e+row.f-n):null,turnout:validN?n:null};
  });
  const m=Paired.metrics(rows),c=Paired.counts(rows),lower=rows.length&&rows.every(r=>r.lower!==null)?rows.reduce((n,r)=>n+r.lower,0):null;
  const registryUpper=m.missing||!rows.length?null:rows.reduce((n,r)=>n+r.registryUpper,0);
  const outsideMunicipality=filters.city?(registry.municipalities||[]).filter(r=>r.identified&&r.key!==filters.city).reduce((n,r)=>n+r.counts.total,0):0;
  const unknownMunicipality=(registry.municipalities||[]).find(r=>!r.identified)?.counts.total||0;
  const summarize=unit=>Paired.group(rows,unit).map(g=>({...g,...Paired.counts(g.rows),...leadershipIndicators(g.rows),registryUpper:g.missing?null:g.rows.reduce((n,r)=>n+r.registryUpper,0)}));
  return {registry,rows,...m,...c,...leadershipIndicators(rows),e:m.missing||!rows.length?null:m.e,f:m.missing||!rows.length?null:m.f,lower,registryUpper,outsideMunicipality,unknownMunicipality,located:rows.filter(r=>!r.locationConflict).length,municipal:summarize('city'),zones:summarize('zone'),places:summarize('place'),correlation:Paired.correlation(rows)};
}
export function analyzeAllLeaderships(records,voteRows,filters={}){
  const result=analyzeRegistry(registryScope(records,ALL_LEADERSHIPS),voteRows,filters);
  result.leaderships=groups(records).map(g=>({id:g.id,leadership:g.leadership,coordinator:g.coordinator,...analyzeRegistry(registryScope(g.records,g.id),voteRows,filters)}));
  const owners=new Map();
  for(const g of result.leaderships)for(const r of g.rows){if(!owners.has(r.key))owners.set(r.key,new Set());owners.get(r.key).add(g.id);}
  const shared=new Set([...owners].filter(([,ids])=>ids.size>1).map(([key])=>key));
  result.overlap={sections:shared.size,registered:result.rows.filter(r=>shared.has(r.key)).reduce((n,r)=>n+r.registered,0),leaders:result.leaderships.filter(g=>g.rows.some(r=>shared.has(r.key))).map(g=>({leadership:g.leadership,coordinator:g.coordinator,sections:g.rows.filter(r=>shared.has(r.key)).length}))};
  return result;
}
export function partnershipReport(pair,result,sources,filters={},scenario=null){
  const int=n=>n==null?'—':new Intl.NumberFormat('pt-BR').format(n),pct=n=>n==null?'—':(n*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
  const table=(title,rows)=>({type:'table',title,compact:true,headers:['Território','Cadastros','Estadual','Federal','Teto da dupla','Máximo %','Proximidade ponderada'],widths:[3.1,1,1,1,1,1.2,1.6],rows:rows.map(r=>[r.label||Paired.label(r,'section'),int(r.registered),int(r.e),int(r.f),int(r.registryUpper),pct(r.compatibilityPercent),pct(r.weightedProximity)])});
  const overlap=result.overlap||{sections:0,registered:0,leaders:[]};
  const hypothetical=scenario?.ok?[{type:'heading',title:'Cenário hipotético informado — não é resultado apurado'},{type:'pie',title:'Distribuição hipotética dos '+int(scenario.total)+' cadastros',rows:[{label:'Nos dois candidatos',value:scenario.both,color:'#1262ae'},{label:'Somente estadual',value:scenario.onlyState,color:'#7864b6'},{label:'Somente federal',value:scenario.onlyFederal,color:'#148379'},{label:'Nenhum dos dois / abstenção',value:scenario.neither,color:'#697b91'}]},{type:'table',summaryEssential:true,title:'Hipótese compatível com os limites disponíveis por seção',compact:true,headers:['Hipótese','Cadastros','Percentual'],widths:[5,1,1.5],rows:[['Nos dois candidatos',int(scenario.both),pct(scenario.percentages.both)],['Somente estadual',int(scenario.onlyState),pct(scenario.percentages.onlyState)],['Somente federal',int(scenario.onlyFederal),pct(scenario.percentages.onlyFederal)],['Nenhum dos dois / abstenção',int(scenario.neither),pct(scenario.percentages.neither)]]}]:[];
  return {electionYear:2026,turn:1,title:'Compatibilidade da liderança — Estadual × Federal',subtitle:pair.leadership+' • '+pair.coordinator,generatedAt:new Date().toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}),compactIndicators:true,
    summaryNote:'Teto agregado por seção / cadastros únicos do recorte; não comprova voto individual ou entrega de liderança. Base: '+int(result.registry.total)+' ativos; '+int(result.registry.eligible)+' contabilizáveis; '+int(result.registry.pending)+' fora da contagem; '+int(result.registry.repeated)+' repetições. Fora do município: '+int(result.outsideMunicipality||0)+'; município não confirmado: '+int(result.unknownMunicipality||0)+'. Grupos podem compartilhar seções; não some seus votos. Cenário, quando incluído, é hipótese informada, não resultado apurado.',
    finalResult:{title:'Resultado final do recorte',summary:result.registryUpper==null?'Compatibilidade não calculada: cobertura incompleta.':'Até '+int(result.registryUpper)+' de '+int(result.registered)+' cadastros • '+pct(result.compatibilityPercent),detail:'Teto somado por seção. Percentual sobre os cadastros únicos do recorte selecionado; não confirma voto individual.',items:[['Teto estimado com cadastros',int(result.registryUpper)],['Cadastros únicos no recorte',int(result.registered)],['Compatibilidade máxima possível',pct(result.compatibilityPercent)]]},
    meta:[['Estadual',pair.estadual.number+' — '+pair.estadual.name],['Federal',pair.federal.number+' — '+pair.federal.name],['Município',filters.cityName||'Todos os municípios com cadastros conferidos do grupo'],['Zona',filters.zone||'Todas as zonas do grupo'],['Local',filters.placeName||'Todos os locais do recorte'],...sources.map(s=>[s.office==='estadual'?'Fonte estadual':'Fonte federal',s.source+' • versão '+s.version])],
    indicators:[{label:'Cadastros únicos no recorte',value:int(result.registered)},{label:'Compatibilidade máxima possível',value:result.compatibilityPercent==null?'—':'Até '+pct(result.compatibilityPercent),note:int(result.registryUpper)+' de '+int(result.registered)+' cadastros'},{label:'Proximidade territorial ponderada',value:pct(result.weightedProximity)},{label:'Votos estadual nas seções',value:int(result.e)},{label:'Votos federal nas seções',value:int(result.f)},{label:'Diferença para o teto da dupla',value:int(result.outsideCeiling),note:pct(result.deficitPercent)+' dos cadastros únicos do recorte'},{label:'Cobertura da votação no recorte',value:pct(result.coverage),note:int(result.matched)+' cadastros com votação/localização compatíveis'},{label:'Seções compartilhadas',value:int(overlap.sections),note:int(overlap.leaders.length)+' outros grupos visíveis'},{label:'Diferença dos totais',value:int(result.gap)}],
    note:'Votos de todos os eleitores das seções trabalhadas, incluindo pessoas de fora do grupo. Compatibilidade máxima = soma(min(cadastros, estadual, federal) por seção) ÷ cadastros únicos no recorte. O teto de 100% não confirma adesão. Proximidade ponderada = média de min(E,F)/max(E,F) por seção, ponderada pelos cadastros; se ambos os candidatos têm zero voto na seção, a contribuição é zero. Esses indicadores não identificam voto individual, não confirmam acerto nem atribuem os votos ao trabalho do grupo. Cadastros ativos no grupo: '+int(result.registry.total)+'; únicos contabilizáveis: '+int(result.registry.eligible)+'; fora da contagem: '+int(result.registry.pending)+'; repetições contadas uma vez: '+int(result.registry.repeated)+'. Sobreposição: '+int(overlap.sections)+' seções e '+int(overlap.registered)+' cadastros em seções com outros grupos visíveis ao perfil; não somar os votos dessas seções como entregas independentes. Correlação por seção: '+(result.correlation.r==null?result.correlation.reason:result.correlation.r.toFixed(3))+(result.lower==null?' Limite mínimo indisponível: falta comparecimento confirmado por seção.':' Faixa territorial possível de coincidência: '+int(result.lower)+' a '+int(result.upper)+'.')+(scenario?.ok?' Cenário hipotético informado: confere limites de cadastros e votos por seção, sem fonte integrada de comparecimento/eleitorado. Não é inferência, probabilidade ou identificação de voto.':''),
    blocks:[{type:'paragraph',text:'Contabilidade: cadastros com zona, seção e local confirmados, mantendo as demais pendências e votos dos mesmos município, zona, local e seção do recorte. '+int(result.outsideMunicipality||0)+' cadastros em outros municípios; '+int(result.unknownMunicipality||0)+' com município não identificado. Esses cadastros permanecem na base e ficam fora do denominador do município escolhido.'},...(result.leaderships?[{type:'table',title:'Todas as lideranças autorizadas — mesma dupla consultada',compact:true,headers:['Liderança / coordenação','Ativos','Aptos no recorte','Fora da contagem','Estadual','Federal','Teto da dupla'],widths:[3,1,1,1,1,1,1],rows:result.leaderships.map(g=>[g.leadership+' / '+g.coordinator,int(g.registry.total),int(g.registered),int(g.registry.pending),int(g.e),int(g.f),int(g.registryUpper)])},{type:'paragraph',text:'Os totais gerais contam cada eleitor e cada seção uma vez. As linhas por liderança podem compartilhar eleitores e seções; seus votos e limites não devem ser somados. A consulta da mesma dupla não altera as parcerias declaradas dos grupos.'}]:[]),{type:'bars',title:'Compatibilidade máxima possível por zona — % dos cadastros',rows:result.zones.filter(r=>r.compatibilityPercent!==null).map(r=>({label:r.label,values:[{label:'Máximo possível (%)',value:Number((r.compatibilityPercent*100).toFixed(1)),color:'#1262ae'},{label:'Proximidade ponderada (%)',value:Number((r.weightedProximity*100).toFixed(1)),color:'#148379'}]}))},table('Municípios',result.municipal),table('Zonas',result.zones),...hypothetical]};
}
