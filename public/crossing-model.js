(function(root){
  'use strict';
  const P=typeof module!=='undefined'&&module.exports?require('./paired-analysis.js'):root.PairedAnalysis;
  const offices={estadual:'Estadual',federal:'Federal'},fmt=n=>new Intl.NumberFormat('pt-BR').format(n);
  const reportUnits={municipality:'Municípios',zone:'Zonas',place:'Locais de votação',section:'Seções',neighborhood:'Bairros'};
  function key(r,unit){return P.groupKey(r,unit);}
  function matches(r,f={}){
    return (!f.cities?.length||f.cities.includes(r.code))&&(!f.zone||r.zone===f.zone)&&(!f.section||r.section===f.section)
      &&(!f.places?.length||f.places.includes(P.placeKey(r)))&&(!f.neighborhood||P.neighborhoodKey(r)===f.neighborhood);
  }
  function metrics(rows,slots,registryMode){
    const totals=slots.map((slot,i)=>!slot?null:rows.some(r=>r[i?'f':'e']===null)?null:rows.reduce((n,r)=>n+r[i?'f':'e'],0));
    const single=slots.filter(Boolean).length===1,active=slots.findIndex(Boolean),cross=!!(slots[0]&&slots[1]&&slots[0].office!==slots[1].office),complete=slots.every((slot,i)=>!slot||totals[i]!==null)&&rows.every(r=>!r.locationConflict);
    const upper=cross&&complete?rows.reduce((n,r)=>n+Math.min(r.e,r.f),0):null;
    const registered=rows.reduce((n,r)=>n+(r.registered||0),0),registryUpper=registryMode&&single&&complete?rows.reduce((n,r)=>n+Math.min(r.registered||0,r[active?'f':'e']),0):registryMode&&upper!==null?rows.reduce((n,r)=>n+Math.min(r.registered,r.e,r.f),0):null;
    return {a:totals[0],b:totals[1],cross,single,upper,registered,registryUpper,sections:rows.length,difference:totals.every(v=>v!==null)?totals[1]-totals[0]:null,missing:rows.filter(r=>slots.some((s,i)=>s&&r[i?'f':'e']===null)).length};
  }
  function group(rows,unit,slots,registryMode){
    const map=new Map();for(const r of rows){const id=key(r,unit);if(!map.has(id))map.set(id,{key:id,label:P.label(r,unit),rows:[]});map.get(id).rows.push(r);}
    return [...map.values()].map(g=>({...g,...metrics(g.rows,slots,registryMode)})).sort((a,b)=>a.label.localeCompare(b.label,'pt-BR',{numeric:true}));
  }
  function evaluate({projected,slots,filters={},registry=null,registryMode=false,joined=null}){
    if(!slots.some(Boolean)||slots.some(s=>s&&!offices[s.office]))throw Error('Selecione pelo menos um candidato de um cargo válido.');
    if(slots[0]&&slots[1]&&slots[0].office===slots[1].office&&String(slots[0].candidate[0])===String(slots[1].candidate[0]))throw Error('Escolha candidatos diferentes para comparar o mesmo cargo.');
    for(let i=0;i<2;i++){if(!slots[i])continue;for(const r of projected[i]){if(r.key!==P.sectionKey(r.code,r.zone,r.section)||!Number.isSafeInteger(r.votes)||r.votes<0||!Number.isFinite(r.total)||r.total<r.votes)throw Error('Dados por seção incompatíveis com a fonte selecionada.');}}
    if(registryMode&&!registry)throw Error('Desbloqueie a base de cadastros para usar este modo.');
    let rows=joined||P.join(projected[0],projected[1]);const registered=new Map((registry?.sections||[]).map(r=>[r.key,r]));let divergent=0;
    if(registryMode)rows=rows.map(r=>{const record=registered.get(r.key),compatible=record&&!r.locationConflict&&P.placeVerified(r)&&P.normalize(record.place)===P.normalize(r.place);if(record&&!compatible&&matches(r,filters))divergent+=record.registered;return {...r,registered:compatible?record.registered:0};});
    if(registryMode){const seen=new Set(rows.map(r=>r.key));for(const r of registry.sections)if(!seen.has(r.key))rows.push({...r,e:null,f:null,locationConflict:false,registered:r.registered,missingVotes:true});}
    const filtered=rows.filter(r=>matches(r,filters)&&(!registryMode||r.registered>0));
    return {slots,filters,registryMode,registry:registry?{total:registry.total,eligible:registry.eligible,pending:registry.pending,pendingIncluded:registry.pendingIncluded||0,repeated:registry.repeated,conflicting:registry.conflicting}:null,divergent,rows:filtered,metrics:metrics(filtered,slots,registryMode),
      groups:Object.fromEntries(['municipality','zone','place','section','neighborhood'].map(unit=>[unit,group(filtered,unit,slots,registryMode)]))};
  }
  const name=s=>s?offices[s.office]+' • '+s.candidate[1]+' — '+s.candidate[2]:'Não utilizado';
  function reach(result){
    if(!result.registryMode||!result.registry||!result.metrics.cross&&!result.metrics.single)return null;
    const total=Math.max(0,result.registry.eligible),reached=result.metrics.registryUpper;
    return {total,reached,remaining:reached===null?null:total-reached,ratio:total>0&&reached!==null?reached/total:null};
  }
  function hasSectionCeiling(result){return result.metrics.cross||result.registryMode&&result.metrics.single;}
  function reachLabel(result){return result.registryMode&&result.metrics.single?'Alcance estimado — '+offices[result.slots.find(Boolean).office]:'Alcance estimado da base';}
  const utilizationPercent=value=>value===null?'Não calculado':new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}).format(value);
  function utilization(result){
    return result.registryMode&&hasSectionCeiling(result)?P.registryUtilization(result.rows,result.slots.flatMap((slot,i)=>slot?[i?'f':'e']:[])):null;
  }
  function utilizationRows(result,shared=new Set()){
    const fields=result.slots.flatMap((slot,i)=>slot?[i?'f':'e']:[]);
    return result.rows.map(r=>({key:r.key,code:r.code,city:r.city,place:r.place,zone:r.zone,section:r.section,registered:r.registered,a:result.slots[0]?r.e:null,b:result.slots[1]?r.f:null,...P.registryUtilization([r],fields),shared:shared.has(r.key)}));
  }
  function leadershipUtilization(result,groups,joined=result.rows,visibleGroups=groups){
    if(!utilization(result))return [];
    const byKey=new Map(joined.map(r=>[r.key,r])),allowed=new Set(result.rows.map(r=>r.key)),members=new Map();
    const identity=g=>g.registry.id||JSON.stringify([g.coordinator||'',g.leadership]);
    for(const g of visibleGroups)for(const r of g.registry.sections){if(!members.has(r.key))members.set(r.key,new Set());members.get(r.key).add(identity(g));}
    return groups.map(g=>{
      const scope=g.utilizationRegistry||g.registry,sections=scope.sections.filter(r=>allowed.has(r.key)),id=identity(g);
      const value=evaluate({projected:[[],[]],joined:sections.map(r=>byKey.get(r.key)).filter(Boolean),slots:result.slots,filters:result.filters,registry:{...scope,sections},registryMode:true});
      const shared=new Set(value.rows.filter(r=>[...(members.get(r.key)||[])].some(other=>other!==id)).map(r=>r.key)),rows=utilizationRows(value,shared);
      return {leadership:g.leadership,coordinator:g.coordinator||'Sem coordenador',total:g.registry.total,pending:g.registry.pending,...utilization(value),sharedSections:shared.size,sharedRegistered:rows.filter(r=>r.shared).reduce((n,r)=>n+r.registered,0),rows};
    });
  }
  function utilizationTable(result,entries){
    const value=g=>[g.leadership+' / '+g.coordinator,fmt(g.registered),g.upper===null?'Não calculado':fmt(g.upper)+' ('+utilizationPercent(g.ratio)+')',g.deficit===null?'Não calculado':fmt(g.deficit)+' ('+utilizationPercent(g.deficitRatio)+')',fmt(g.sharedSections)+(g.sharedSections===1?' seção / ':' seções / ')+fmt(g.sharedRegistered)+' cad.',fmt(g.evaluated)+' / '+fmt(g.registered)];
    const shared=new Set(entries.flatMap(g=>g.rows.filter(r=>r.shared).map(r=>r.key))),summary=utilization(result);
    const total=value({...summary,leadership:'Total único do recorte',coordinator:'não somar lideranças',sharedSections:shared.size,sharedRegistered:result.rows.filter(r=>shared.has(r.key)).reduce((n,r)=>n+r.registered,0)});
    return {type:'table',title:'Aproveitamento máximo compatível por liderança',compact:true,headers:['Liderança / coordenação','Cad.','Teto / %','Diferença / %','Seções comuns','Cobertura'],widths:[3.2,.85,1.45,1.4,1.6,1],rows:entries.map(value),cellColors:entries.map(g=>['','','',g.deficit>0?'#b53838':'#24415f']),totalRow:total};
  }
  function utilizationSectionTable(result,entries){
    const shared=new Set(entries.flatMap(g=>g.rows.filter(r=>r.shared).map(r=>r.key))),rows=utilizationRows(result,shared);
    return {type:'table',title:'Conferência por seção — sem atribuição de votos',compact:true,headers:['Município / escola','Zona / seção','Cad.','Votos '+result.slots.flatMap((s,i)=>s?['C'+(i+1)]:[]).join(' / '),'Teto / %','Diferença / %','Seção comum'],widths:[3.2,1,.8,1.1,1.4,1.4,1.1],rows:rows.map(r=>[r.city+' / '+r.place,String(r.zone).padStart(3,'0')+' / '+String(r.section).padStart(4,'0'),fmt(r.registered),result.slots.flatMap((s,i)=>s?[r[i?'b':'a']===null?'Sem cobertura':fmt(r[i?'b':'a'])]:[]).join(' / '),r.upper===null?'Não calculado':fmt(r.upper)+' ('+utilizationPercent(r.ratio)+')',r.deficit===null?'Não calculado':fmt(r.deficit)+' ('+utilizationPercent(r.deficitRatio)+')',r.shared?'Sim':'Não consta']),rowColors:rows.map(r=>r.upper===null?'#fff6df':r.deficit>0?'#fdecef':null)};
  }
  function utilizationReport(result,options={},selection=['leaders']){
    const u=utilization(result);if(!u)throw Error('Consulte cadastros com um candidato ou com Estadual × Federal.');
    if(!Array.isArray(selection)||!selection.length||selection.some(id=>!['leaders','sections'].includes(id)))throw Error('Selecione um quadro válido de aproveitamento.');
    const entries=options.utilizationEntries||[],full=report(result,{...options,units:[],registryGroups:[]}),table=utilizationTable(result,entries);
    const final={title:'Resultado consolidado — cadastros únicos',summary:!u.registered?'Sem cadastros no recorte.':u.upper===null?'Não calculado: falta cobertura completa.':'Máximo '+fmt(u.upper)+' de '+fmt(u.registered)+' ('+utilizationPercent(u.ratio)+') • diferença '+fmt(u.deficit)+' ('+utilizationPercent(u.deficitRatio)+')',detail:'Cobertura: '+fmt(u.evaluated)+' / '+fmt(u.registered)+' cadastros. Total calculado por seção, sem somar tetos de lideranças compartilhadas.',items:[['Cadastros do recorte',fmt(u.registered)],['Máximo compatível',u.upper===null?'Não calculado':fmt(u.upper)],['Aproveitamento máximo',utilizationPercent(u.ratio)],['Diferença para o teto',u.deficit===null?'Não calculado':fmt(u.deficit)],['Déficit relativo',utilizationPercent(u.deficitRatio)],['Cadastros sem cobertura',fmt(u.uncovered)]]};
    return {...full,title:'Aproveitamento máximo compatível',dashboard:null,finalResult:final,indicatorColumns:4,indicators:[{label:'Cadastros do recorte',value:fmt(u.registered)},{label:'Máximo compatível',value:u.upper===null?'Não calculado':fmt(u.upper),note:utilizationPercent(u.ratio)},{label:'Diferença para o teto',value:u.deficit===null?'Não calculado':fmt(u.deficit),note:utilizationPercent(u.deficitRatio),color:u.deficit>0?'#b53838':undefined},{label:'Cobertura',value:utilizationPercent(u.coverage),note:fmt(u.evaluated)+' / '+fmt(u.registered)}],
      meta:[...full.meta,['Fora da contagem (base, antes dos filtros)',fmt(result.registry.pending)],['Local divergente da votação',fmt(result.divergent)],['Conteúdo do PDF',selection.map(id=>id==='leaders'?'Lideranças':'Seções').join(' • ')]],
      note:'Percentuais sobre os cadastros únicos do recorte atual. Máximo = soma de min(cadastros, votos dos candidatos) em cada seção; diferença = cadastros menos esse teto. As linhas de lideranças são limites independentes e não devem ser somadas. Compartilhamento considera apenas grupos autorizados ao perfil. O BU inclui pessoas de fora da base e não comprova votos ou desempenho de uma liderança. Ausência de dados não é zero; suspende o percentual global. A relação nominal de eleitores não integra esta classificação.',
      blocks:[...(selection.includes('leaders')?[{...table,rows:[...table.rows,table.totalRow],rowColors:[...table.rows.map(()=>null),'#dcecfb']}]:[]),...(selection.includes('sections')?[utilizationSectionTable(result,entries)]:[])]};
  }
  function voteTotals(result,{stateCityCodes=[]}={}){
    if(result.registryMode||!result.metrics.cross)return null;
    const expected=new Set(stateCityCodes.map(String)),present=new Set(result.groups.municipality.map(g=>String(g.key))),f=result.filters;
    const statewide=expected.size>0&&present.size===expected.size&&[...expected].every(code=>present.has(code))&&(!f.cities?.length||f.cities.length===expected.size&&f.cities.every(code=>expected.has(String(code))))&&!f.zone&&!f.section&&!f.places?.length&&!f.neighborhood;
    return {totalLabel:statewide?'Total do Pará':'Total do recorte',statewide,municipalities:present.size,upper:result.metrics.sections?result.metrics.upper:null};
  }
  function finalResult(result){
    const m=result.metrics,amount=n=>n===null?'Não calculado':fmt(n),percentage=(n,base)=>n===null?'Não calculado':base?new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(n/base):'Sem base';
    const votes=result.slots.flatMap((s,i)=>s?[['Votos C'+(i+1),amount(m[i?'b':'a'])]]:[]),items=[...votes,...(result.registryMode?[['Cadastros no filtro',fmt(m.registered)]]:[]),['Seções do filtro',fmt(m.sections)]];
    if(!m.sections)return {title:'Resultado final do recorte',summary:'Sem seções neste recorte. Compatibilidade não calculada.',detail:'Revise os filtros para consultar um território com dados.',items};
    if(result.registryMode&&hasSectionCeiling(result)){
      const r=reach(result),percent=percentage(r.reached,r.total),u=utilization(result);items.push(['Teto estimado com cadastros',amount(r.reached)],['Alcance estimado na base selecionada',percent],['Base contabilizável selecionada',fmt(r.total)],['Aproveitamento máximo no recorte',utilizationPercent(u.ratio)],['Diferença para o teto no recorte',u.deficit===null?'Não calculado':fmt(u.deficit)+' ('+utilizationPercent(u.deficitRatio)+')']);
      return {title:'Resultado final do recorte',summary:r.reached===null?'Compatibilidade não calculada: falta cobertura completa.':'Até '+fmt(r.reached)+(r.reached===1?' cadastro compatível':' cadastros compatíveis')+' • '+percent+' da base selecionada',detail:fmt(m.registered)+' cadastros no filtro • '+fmt(m.sections)+' seções. Base do percentual: '+fmt(r.total)+' cadastros contabilizáveis, antes dos filtros territoriais. Estimativa agregada.',items};
    }
    if(m.cross){
      items.push(['Teto agregado da dupla',amount(m.upper)],['Teto / votos C1',percentage(m.upper,m.a)],['Teto / votos C2',percentage(m.upper,m.b)]);
      return {title:'Resultado final do recorte',summary:m.upper===null?'Compatibilidade não calculada: falta cobertura completa.':'Até '+fmt(m.upper)+(m.upper===1?' voto':' votos')+' no limite agregado da dupla',detail:votes.map(r=>r[0]+': '+r[1]).join(' • ')+' • '+fmt(m.sections)+' seções. Teto somado por seção; não confirma votos das mesmas pessoas.',items};
    }
    return {title:'Resultado final do recorte',summary:votes.map(r=>r[0]+': '+r[1]).join(' • '),detail:fmt(m.sections)+' seções'+(m.difference===null?'':' • Diferença C2 − C1: '+fmt(m.difference))+' no recorte selecionado.',items};
  }
  function note(result){if(result.registryMode&&result.metrics.single)return 'O teto estimado soma o menor valor entre cadastros e votos do candidato em cada seção. Zona, seção e local devem estar confirmados; as demais pendências permanecem. Títulos válidos repetidos contam uma vez. É um limite agregado; não confirma votos individuais.';if(result.metrics.cross&&!result.registryMode)return 'Votos compatíveis (teto estimado): soma do menor total entre os dois candidatos em cada seção. Os totais por município e do estado usam essa mesma soma; não o menor dos totais municipais ou estaduais. É um limite matemático, não uma quantidade comprovada de votos das mesmas pessoas.';return result.metrics.cross?'O teto agregado soma o menor total em cada seção. Não confirma votos das mesmas pessoas. Cadastros com zona, seção e local confirmados contam, mantendo as demais pendências; títulos válidos repetidos contam uma vez; votos das seções incluem pessoas de fora da base.':'A compatibilidade entre cargos não se aplica a dois candidatos do mesmo cargo ou a uma consulta individual. O quadro apresenta resultados e diferenças de votos.';}
  function territoryStatus(g,cross,singleIndex=null){
    if(!cross&&singleIndex===null)return {kind:'normal',label:'',color:null};
    const ceiling=singleIndex===null?g.upper:g.registryUpper;
    if(ceiling===null)return {kind:'missing',label:g.rows.some(r=>r.locationConflict)?'Local divergente; conferir':'Sem cobertura completa',color:'#fff6df'};
    if(g.sections>0&&ceiling===0)return {kind:'zero',label:singleIndex!==null?'Sem votos para C'+(singleIndex+1):g.a===0&&g.b===0?'Sem votos para C1 e C2':g.a===0?'Sem votos para C1':g.b===0?'Sem votos para C2':'Teto zero entre as seções',color:'#fdecef'};
    return {kind:'normal',label:'',color:null};
  }
  function groupPercent(g){return g.registryUpper===null?'Sem cobertura':g.registered?new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(g.registryUpper/g.registered):'Sem base';}
  function shortHeaders(result){const m=result.metrics;return ['Território',...(result.registryMode?['Cadastros']:[]),...result.slots.flatMap((s,i)=>s?['Votos C'+(i+1)]:[]),...(result.slots.every(Boolean)?['Diferença 2 - 1']:[]),...(m.cross?[result.registryMode?'Teto por seção':'Compatíveis (teto)',...(result.registryMode?['Teto com cadastros']:[])]:[]),...(result.registryMode&&m.single?['Teto com cadastros','Alcance estimado (%)']:[])];}
  function table(result,unit,{includeTotal=false,totalLabel='Total do recorte'}={}){
    const m=result.metrics,individual=result.registryMode&&m.single,headers=['Território',...(result.registryMode?['Cadastros']:[]),...result.slots.flatMap((s,i)=>s?[name(s)]:[]),...(result.slots.every(Boolean)?['Diferença 2 − 1']:[]),...(m.cross?[result.registryMode?'Teto por seção':'Compatíveis (teto)',...(result.registryMode?['Teto com cadastros']:[])]:[]),...(individual?['Teto com cadastros','Alcance estimado (%)']:[])];
    const values=g=>[g.label,...(result.registryMode?[fmt(g.registered)]:[]),...result.slots.flatMap((s,i)=>s?[g[i?'b':'a']===null?'Sem cobertura':fmt(g[i?'b':'a'])]:[]),...(result.slots.every(Boolean)?[g.difference===null?'—':fmt(g.difference)]:[]),...(m.cross?[g.upper===null?'—':fmt(g.upper),...(result.registryMode?[g.registryUpper===null?'—':fmt(g.registryUpper)]:[])]:[]),...(individual?[g.registryUpper===null?'—':fmt(g.registryUpper),groupPercent(g)]:[])];
    const rowStatus=result.groups[unit].map(g=>territoryStatus(g,m.cross,individual?result.slots.findIndex(Boolean):null));
    return {headers,rows:result.groups[unit].map(values),widths:headers.map((_,i)=>i?1:3),rowStatus,rowColors:rowStatus.map(s=>s.color),...(includeTotal?{totalRow:values({...m,upper:m.sections?m.upper:null,label:totalLabel})}:{})};
  }
  function sectionAlerts(result){
    if(!hasSectionCeiling(result))return {zero:[],missing:[]};
    const list=result.groups.section.map(g=>{const r=g.rows[0],status=territoryStatus(g,result.metrics.cross,result.metrics.single?result.slots.findIndex(Boolean):null);return {key:r.key,code:r.code,city:r.city,zone:String(r.zone).padStart(3,'0'),section:String(r.section).padStart(4,'0'),place:r.place,registered:g.registered,a:g.a,b:g.b,status};});
    return {zero:list.filter(r=>r.status.kind==='zero'),missing:list.filter(r=>r.status.kind==='missing')};
  }
  function sectionAlertTable(result,rows,title){
    const headers=['Município / local','Zona','Seção',...(result.registryMode?['Cadastros']:[]),...result.slots.flatMap((s,i)=>s?['Votos C'+(i+1)]:[]),'Motivo'];
    return {type:'table',title,compact:true,headers,widths:[3,.7,.7,...(result.registryMode?[.9]:[]),...result.slots.flatMap(s=>s?[.9]:[]),2.2],rows:rows.map(r=>[r.city+' • '+r.place,r.zone,r.section,...(result.registryMode?[fmt(r.registered)]:[]),...result.slots.flatMap((s,i)=>s?[r[i?'b':'a']===null?'Sem cobertura':fmt(r[i?'b':'a'])]:[]),r.status.label]),rowColors:rows.map(r=>r.status.color),rowStatus:rows.map(r=>r.status)};
  }
  function sectionReport(result,options={}){
    if(!hasSectionCeiling(result))throw Error('Selecione Cadastros × um candidato, ou um candidato estadual e um federal.');
    const full=report(result,options),alerts=sectionAlerts(result);
    return {...full,title:'Seções com teto zero e cobertura a conferir',subtitle:result.slots.flatMap((s,i)=>s?['C'+(i+1)+': '+name(s)]:[]).join(' × '),dashboard:null,compactIndicators:true,finalResult:alertFinalResult(result),
      indicators:[{label:'Seções com teto zero',value:fmt(alerts.zero.length)},...(result.registryMode?[{label:'Cadastros nessas seções',value:fmt(alerts.zero.reduce((n,r)=>n+r.registered,0))}]:[]),{label:'Seções a conferir',value:fmt(alerts.missing.length)}],
      note:'Rosa: teto agregado zero, com cobertura completa. Amarelo: dados ausentes ou local divergente; não classificado como zero. Os números descrevem seções e não identificam o voto ou a preferência de qualquer pessoa cadastrada.',
      blocks:[['zero','Seções com teto agregado zero'],['missing','Seções com cobertura a conferir']].map(([key,title])=>sectionAlertTable(result,alerts[key],title+' ('+alerts[key].length+')'))};
  }
  function alertFinalResult(result){
    const a=sectionAlerts(result),zero=a.zero.reduce((n,r)=>n+r.registered,0),missing=a.missing.reduce((n,r)=>n+r.registered,0);
    return {title:'Resultado final desta listagem',summary:fmt(a.zero.length)+(a.zero.length===1?' seção':' seções')+' com teto zero'+(result.registryMode?' • '+fmt(zero)+(zero===1?' cadastro vinculado':' cadastros vinculados'):''),detail:fmt(a.missing.length)+(a.missing.length===1?' seção não calculada':' seções não calculadas')+(result.registryMode?' • '+fmt(missing)+(missing===1?' cadastro vinculado':' cadastros vinculados'):'')+'. Zero e dados sem cobertura são situações distintas. Totais únicos do recorte, sem somar repetições entre lideranças.',items:[['Seções com teto zero',fmt(a.zero.length)],...(result.registryMode?[['Cadastros em seções com teto zero',fmt(zero)]]:[]),['Seções não calculadas',fmt(a.missing.length)],...(result.registryMode?[['Cadastros em seções não calculadas',fmt(missing)]]:[])]};
  }
  function leadershipAlerts(result,groups,joined=result.rows){
    if(!result.registryMode||!hasSectionCeiling(result))return [];
    // Reuse already validated votes, indexing only the group's sections. This
    // avoids scanning every municipality again for each leadership.
    const byKey=new Map(joined.map(r=>[r.key,r]));
    return groups.map(g=>{
      const voteRows=g.registry.sections.map(r=>byKey.get(r.key)).filter(Boolean);
      const r=evaluate({projected:[[],[]],joined:voteRows,slots:result.slots,filters:result.filters,registry:g.registry,registryMode:true});
      return {leadership:g.leadership,coordinator:g.coordinator||'Sem coordenador',registered:r.metrics.registered,total:g.registry.total,eligible:g.registry.eligible,pending:g.registry.pending,alerts:sectionAlerts(r)};
    });
  }
  function leadershipAlertSummary(entries){
    return {type:'table',title:'Conferência agregada por liderança',compact:true,headers:['Liderança / coordenação','Seções zero','Cadastros nas seções zero','Seções não calculadas','Cadastros não calculados','Fora da contagem (base)'],widths:[3.1,.8,1.1,1,1.1,1.1],rows:entries.map(g=>[g.leadership+' / '+g.coordinator,fmt(g.alerts.zero.length),fmt(g.alerts.zero.reduce((n,r)=>n+r.registered,0)),fmt(g.alerts.missing.length),fmt(g.alerts.missing.reduce((n,r)=>n+r.registered,0)),fmt(g.pending)])};
  }
  function leadershipAlertReport(result,options={}){
    if(!result.registryMode||!hasSectionCeiling(result))throw Error('Consulte cadastros com um candidato ou com a dupla estadual e federal.');
    const full=sectionReport(result,options),entries=options.leadershipAlerts||[];
    const detail=(kind,title)=>{
      const rows=entries.flatMap(g=>g.alerts[kind].map(r=>({g,r}))),table=sectionAlertTable(result,rows.map(x=>x.r),title);
      return {...table,headers:['Liderança / coordenação',...table.headers.map(h=>h==='Cadastros'?'Cad.':h)],widths:[2.1,2.6,.9,1,.9,...result.slots.flatMap(s=>s?[1.15]:[]),2],rows:table.rows.map((row,i)=>[rows[i].g.leadership+' / '+rows[i].g.coordinator,...row.map(v=>v==='Sem cobertura'?'—':v)])};
    };
    return {...full,title:'Teto zero e conferência por liderança',note:full.note+' As lideranças podem compartilhar seções e cadastros. Não some suas linhas: o resultado final usa o recorte consolidado sem repetições. Fora da contagem (base) refere-se a pendências cadastrais antes dos filtros territoriais. Cad. = cadastros; traço (—) = votação sem cobertura. Os nomes de eleitores permanecem nos relatórios cadastrais, sem classificação individual de voto.',blocks:[leadershipAlertSummary(entries),detail('zero','Seções com teto zero — por liderança'),detail('missing','Seções não calculadas — por liderança')]};
  }
  function report(result,{sources=[],scope='',filterLabel='',groupLabel='Todas as lideranças autorizadas',registryGroups=[],units=Object.keys(reportUnits),includeLeadershipSummary=true,stateCityCodes=[]}={}){
    const m=result.metrics,compatibility=voteTotals(result,{stateCityCodes});
    return {title:'Central de cruzamentos',subtitle:result.slots.flatMap((s,i)=>s?['C'+(i+1)+': '+name(s)]:[]).join(' × '),generatedAt:new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),compactIndicators:true,indicatorColumns:Math.min(4,result.slots.filter(Boolean).length+(result.registryMode?1:0)+(compatibility?1:0)+1),
      meta:[['Eleição','2026 • 1º turno • Pará'],['Modo',result.registryMode?(m.single?'Cadastros × '+offices[result.slots.find(Boolean).office]:'Cadastros × votos'):'Somente votos'],['Recorte',scope],['Filtros',filterLabel||'Todos do recorte'],...(result.registryMode?[['Liderança / coordenação',groupLabel]]:[]),...sources.flatMap((s,i)=>s&&result.slots[i]?[['Fonte do candidato '+(i+1),s]]:[]),['Referência oficial','https://dadosabertos.tse.jus.br/dataset/resultados-2026']],
      indicators:[...result.slots.flatMap((s,i)=>s?[{label:'Votos • candidato '+(i+1),value:m[i?'b':'a']===null?'Sem cobertura':fmt(m[i?'b':'a'])}]:[]),...(result.registryMode?[{label:'Cadastros no filtro',value:fmt(m.registered)}]:[]),...(compatibility?[{label:'Votos compatíveis (teto)',value:compatibility.upper===null?'Não calculado':fmt(compatibility.upper)}]:[]),{label:'Seções do filtro',value:fmt(m.sections)}],dashboard:reach(result),dashboardTitle:reachLabel(result),finalResult:{...finalResult(result),...(compatibility?{title:compatibility.totalLabel}:{})},note:note(result)+(m.missing?' Há seções sem cobertura de votação. Dados ausentes não foram convertidos em zero.':'')+(result.registryMode&&registryGroups.length?' O total consolidado conta cada cadastro contabilizável uma vez entre todas as lideranças selecionadas. As linhas por liderança podem compartilhar títulos; não some essas linhas. Registros, aptos e pendências são anteriores aos filtros territoriais; Cadastros no filtro usa o mesmo recorte da consulta.':'')+(reach(result)?' Percentual: teto com cadastros dividido pela base contabilizável selecionada sem repetições, antes dos filtros.':'')+(result.registryMode&&m.single?' Percentual das tabelas: teto / cadastros do território.':'')+(hasSectionCeiling(result)?' Rosa: teto agregado zero. Amarelo: cobertura a conferir.':''),
      blocks:[...(includeLeadershipSummary&&result.registryMode&&registryGroups.length?[{type:'table',title:'Resumo das lideranças selecionadas',headers:['Liderança','Coordenador','Registros','Aptos','Fora da contagem','Cadastros no filtro'],widths:[2.5,2.5,1,1,1,1.2],rows:registryGroups.map(g=>[g.leadership,g.coordinator||'Sem coordenador',fmt(g.total),fmt(g.eligible),fmt(g.pending),fmt(g.registered)])}]:[]),...units.map(unit=>({type:'table',title:reportUnits[unit],...table(result,unit),compact:true,headers:shortHeaders(result)}))]};
  }
  function selectedReport(result,selection,options={}){
    if(!Array.isArray(selection)||!selection.length)throw Error('Selecione pelo menos um quadro para o relatório.');
    if(selection.some(unit=>!Object.hasOwn(reportUnits,unit)))throw Error('O relatório contém um detalhamento inválido.');
    const units=Object.keys(reportUnits).filter(unit=>selection.includes(unit)),full=report(result,{...options,registryGroups:[],units,includeLeadershipSummary:false}),m=result.metrics;
    const headers=shortHeaders(result);
    return {...full,title:'Resultado selecionado — '+units.map(unit=>reportUnits[unit]).join(' e '),subtitle:result.slots.flatMap((s,i)=>s?['C'+(i+1)+': '+name(s)]:[]).join(' × '),compactIndicators:true,indicatorColumns:4,
      meta:[...full.meta,['Conteúdo do PDF',units.map(unit=>reportUnits[unit]).join(' • ')]],
      blocks:full.blocks.map(block=>({...block,compact:true,headers,widths:headers.map((_,i)=>i?1:3.2)}))};
  }
  function summaryReport(result,options={}){
    const full=report(result,{...options,units:['municipality','zone']}),m=result.metrics;
    const headers=shortHeaders(result);
    const leadership=full.blocks.find(b=>b.title==='Resumo das lideranças selecionadas');
    const base={...full,title:'Resumo simples',subtitle:result.registryMode?'Cadastros × votos • resumo territorial':'Comparativo de votos • resumo territorial',layout:'single-page-summary',
      candidates:result.slots.flatMap((s,i)=>s?['C'+(i+1)+': '+name(s)]:[]),
      meta:full.meta.filter(([label])=>['Recorte','Filtros','Liderança / coordenação'].includes(label)||result.registryMode&&m.single&&label==='Modo'),
      sources:(options.sources||[]).filter((s,i)=>s&&result.slots[i]),
      note:(result.registryMode&&m.single?note(result):m.cross?'Teto: soma dos menores totais por seção; estimativa agregada, sem confirmação de votos individuais.':result.slots.every(Boolean)?'Diferença: votos C2 menos C1; não representa compatibilidade entre cargos.':'Consulta individual: votação do candidato no recorte selecionado.')+(m.missing?' Sem cobertura: ausência de dados, não zero.':'')+(leadership?' Registros, aptos e pendências: antes dos filtros. Cadastros no filtro: títulos únicos no recorte; não some as linhas das lideranças.':'')+(full.dashboard?' Percentual: teto com cadastros / base contabilizável selecionada sem repetições, antes dos filtros.':'')+(result.registryMode&&m.single?' Tabelas: teto / cadastros do território.':'')+(hasSectionCeiling(result)?' Rosa: teto zero. Amarelo: a conferir.':''),
      blocks:[...(leadership?[{...leadership,widths:[2.4,2.3,1.1,.85,1.2,1.35]}]:[]),...['municipality','zone'].map(unit=>({type:'table',title:unit==='municipality'?'Municípios':'Zonas',...table(result,unit),headers,widths:headers.map((_,i)=>i?1:3.2)}))]};
    const brief=(value,max=110)=>{const text=String(value||'');return text.length<=max?text:text.slice(0,max-30).trimEnd()+'…'+text.slice(-29);};
    const shortSource=value=>{const text=String(value),version=text.match(/^(.*?)(\s*[•|]\s*versão\s+.+)$/i);return version?brief(version[1],65)+version[2]:brief(text,100);};
    const cities=result.groups.municipality.length,zones=result.groups.zone.length,totals=voteTotals(result,options);
    const scope=totals?.statewide?'Todo o Pará':cities<=2?result.groups.municipality.map(g=>g.label).join(', '):'Seleção municipal';
    const filter=options.filterLabel&&options.filterLabel.length<=150?options.filterLabel:[result.filters.zone?'Zona '+result.filters.zone:'',result.filters.section?'Seção '+result.filters.section:'',result.filters.places?.length?result.filters.places.length+' local(is) selecionado(s)':'',result.filters.neighborhood?'Bairro selecionado':''].filter(Boolean).join(' • ')||'Todos os locais dos municípios consultados';
    const groupCount=result.registryMode?(options.registryGroups||[]).length:0,alerts=hasSectionCeiling(result)?sectionAlerts(result):null;
    const meta=[['Recorte',brief(scope)+' • '+fmt(cities)+' municípios • '+fmt(zones)+' recortes de zona • '+fmt(m.sections)+' seções'],['Filtros',brief(filter,150)],
      ...(result.registryMode?[['Liderança / coordenação',groupCount>1?fmt(groupCount)+' lideranças • '+brief(options.groupLabel||'Todas as lideranças autorizadas',80):brief(options.groupLabel||options.registryGroups?.[0]?.leadership||'Base selecionada')],['Base selecionada',fmt(result.registry.total)+' registros • '+fmt(result.registry.eligible)+' contabilizáveis • '+fmt(result.registry.pending)+' fora da contagem • '+fmt(result.registry.repeated)+' repetições • '+fmt(result.registry.pendingIncluded||0)+' com pendência contabilizada']]:[]),
      ...(alerts?[['Conferência',fmt(alerts.zero.length)+' seções com teto zero • '+fmt(alerts.missing.length)+' a conferir'+(result.divergent?' • '+fmt(result.divergent)+' cadastros com local divergente':'')]]:m.missing?[['Conferência',fmt(m.missing)+' seções sem cobertura']]:[])];
    const compactTable=(unit,limit)=>{
      const original=result.groups[unit],ranked=original.length>limit?[...original].sort((a,b)=>(result.registryMode?b.registered-a.registered:(b.a||0)+(b.b||0)-(a.a||0)-(a.b||0))||a.label.localeCompare(b.label,'pt-BR')):original;
      const selected=ranked.slice(0,limit),rest=ranked.slice(limit);
      if(rest.length){const rows=rest.flatMap(g=>g.rows);selected.push({key:'summary-rest',label:(limit?'Demais ':'Todos os ')+(unit==='municipality'?'municípios':'territórios de zona')+' ('+fmt(rest.length)+')',rows,...metrics(rows,result.slots,result.registryMode)});}
      const value=table({...result,groups:{...result.groups,[unit]:selected}},unit);
      return {type:'table',title:unit==='municipality'?'Municípios — síntese':'Zonas — síntese',...value,headers,widths:headers.map((_,i)=>i?1:3.2)};
    };
    const consolidated=()=>{const value=table({...result,groups:{...result.groups,municipality:[{...m,rows:result.rows,key:'summary-total',label:totals?.totalLabel||'Total do recorte'}]}},'municipality');return {type:'table',title:'Resultado consolidado de todos os territórios',...value,headers,widths:headers.map((_,i)=>i?1:3.2)};};
    const final={...base.finalResult};
    if(m.cross&&!result.registryMode&&m.upper!==null&&m.sections){const percent=(n,denominator)=>denominator?new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(n/denominator):'Sem base';final.summary='Até '+fmt(m.upper)+' votos compatíveis (teto) • '+percent(m.upper,m.a)+' de C1 • '+percent(m.upper,m.b)+' de C2';}
    if(!m.cross&&result.slots.every(Boolean)&&m.difference!==null)final.summary+=' • Diferença C2 - C1: '+fmt(m.difference);
    base.finalResult=final;
    const compactNote='Totais de todo o recorte, sem reduzir a seleção. Destaques por quantidade '+(result.registryMode?'de cadastros':'de votos')+'; demais territórios agrupados. '+(m.cross||result.registryMode&&m.single?'Teto estimado por seção; não comprova votos individuais. ':'')+(full.dashboard?'Percentual: teto com cadastros / '+fmt(full.dashboard.total)+' contabilizáveis, antes dos filtros. ':'')+(groupCount?'Total sem repetir títulos; não some linhas de lideranças. ':'')+(hasSectionCeiling(result)?'Rosa: teto zero. Amarelo: sem cobertura ou local divergente. ':'')+'Detalhes no relatório completo.';
    const compact={...base,candidates:base.candidates.map(v=>brief(v,115)),meta,sources:base.sources.map(shortSource),note:compactNote,finalResult:final};
    const summaryVariants=[[3,3],[2,2],[1,1],[0,0]].map(([municipalities,zoneCount])=>({...compact,summaryConsolidated:true,blocks:[...(municipalities===3&&leadership&&leadership.rows.length<=2?[{...leadership,widths:[2.4,2.3,1.1,.85,1.2,1.35]}]:[]),...(municipalities?[compactTable('municipality',municipalities),compactTable('zone',zoneCount)]:[consolidated()])]}));
    return {...base,summaryVariants};
  }
  function voteCompatibilityReport(result,options={}){
    const totals=voteTotals(result,options);if(!totals)throw Error('Selecione Somente votos com um candidato estadual e um federal.');
    const full=report(result,{...options,units:['municipality'],includeLeadershipSummary:false}),block=table(result,'municipality',{includeTotal:true,totalLabel:totals.totalLabel});
    return {...full,title:'Compatibilidade estimada por município',compactIndicators:true,indicatorColumns:4,
      indicators:full.indicators,
      finalResult:{...full.finalResult,title:totals.totalLabel},
      blocks:[{type:'table',title:'Municípios — '+totals.totalLabel,...block,headers:shortHeaders(result),compact:true,rows:[...block.rows,block.totalRow],rowColors:[...block.rowColors,'#dcecfb']}],
      note:full.note+' A última linha consolida todos os municípios do recorte. O total estadual só é identificado quando todos os municípios da base estão presentes e não há filtros territoriais.'};
  }
  const api={evaluate,metrics,group,matches,reach,reachLabel,utilization,utilizationRows,leadershipUtilization,utilizationTable,utilizationSectionTable,utilizationReport,utilizationPercent,voteTotals,voteCompatibilityReport,hasSectionCeiling,note,name,finalResult,alertFinalResult,territoryStatus,sectionAlerts,sectionAlertTable,sectionReport,leadershipAlerts,leadershipAlertSummary,leadershipAlertReport,table,report,selectedReport,summaryReport,reportUnits,offices};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CrossingModel=api;
})(typeof window!=='undefined'?window:globalThis);
