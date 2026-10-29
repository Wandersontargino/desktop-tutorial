(function(root){
  'use strict';
  const offices={estadual:'Deputado Estadual',federal:'Deputado Federal'};
  const colors=['#2358ed','#7940d7'];
  const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const integer=value=>new Intl.NumberFormat('pt-BR').format(value);
  const percent=value=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(value)+'%';
  const signed=value=>(value>0?'+':'')+integer(value);
  const voteChange=typeof module!=='undefined'&&module.exports?require('./election-scope.js').change:(current,previous)=>root.ElectoralScope.change(current,previous);
  const change=(current,previous)=>previous==null?'—':voteChange(current,previous).label;
  const sum=rows=>rows.reduce((n,row)=>n+row.votes,0);
  const padded=value=>String(Number(value));
  function matches(row,filters){
    return (!filters.zone||padded(row.zone)===padded(filters.zone))&&(!filters.section||padded(row.section)===padded(filters.section))
      &&(!filters.place||normalize(row.place)===normalize(filters.place))&&(!filters.neighborhood||normalize(row.neighborhood)===normalize(filters.neighborhood));
  }
  function normalizeSelection(ids,roster){
    const allowed=new Set(roster.map(c=>String(c[0]))),seen=new Set(),result=[];
    for(const raw of ids||[]){const id=String(raw||'');if(id&&allowed.has(id)&&!seen.has(id)){result.push(id);seen.add(id);}if(result.length===2)break;}
    return [result[0]||'',result[1]||''];
  }
  function statewideQuery({office,index,statewide,regional,candidateIds,getPrevious=()=>null,ballotName=()=>''}){
    if(!offices[office]||index?.office!==office||statewide?.office!==office||regional?.office!==office
      ||index.electionYear!==2026||statewide.electionYear!==2026||regional.currentElectionYear!==2026)
      throw new Error('Use uma única base de 2026 e o mesmo cargo para os dois candidatos.');
    const ids=(candidateIds||[]).filter(Boolean).map(String);
    if(ids.length>2||new Set(ids).size!==ids.length)throw new Error('Selecione dois candidatos diferentes do mesmo cargo.');
    const candidates=ids.map(id=>statewide.candidates.find(c=>String(c[0])===id));
    if(candidates.some(c=>!c))throw new Error('Um candidato não pertence ao cargo ativo. Selecione novamente.');
    const codes=index.municipalities.map(m=>String(m[0])),allowed=new Set(codes);
    const completeCoverage=rows=>Array.isArray(rows)&&rows.length===codes.length&&new Set(rows.map(m=>String(m[0]))).size===codes.length&&rows.every(m=>allowed.has(String(m[0])));
    if(!codes.length||allowed.size!==codes.length||!completeCoverage(regional.municipalities)||!completeCoverage(statewide.municipalities))
      throw new Error('A base estadual está incompleta. Atualize os dados antes de gerar o relatório completo.');
    const nominal=index.municipalities.reduce((n,m)=>n+(Number(m[5])||0),0);
    if(nominal!==statewide.totalVotes)throw new Error('Os totais estaduais não correspondem à base ativa. Atualize os dados.');
    const regionOf=new Map(regional.municipalities.map(m=>[String(m[0]),String(m[2])])),regionNames=new Map(regional.regions.map(r=>[String(r[0]),r[1]]));
    const priorCoverage=new Set((regional.totals?.previousMunicipalities||[]).map(([code])=>String(code)));
    const selections=candidates.map((candidate,slot)=>{
      if(!Array.isArray(candidate[6]))throw new Error('Votação municipal do candidato indisponível na base estadual.');
      const currentMap=new Map(candidate[6].map(([code,votes])=>[String(code),Number(votes)]));
      if(currentMap.size!==candidate[6].length||[...currentMap].some(([code,votes])=>!allowed.has(code)||!Number.isSafeInteger(votes)||votes<0)
        ||[...currentMap.values()].reduce((n,v)=>n+v,0)!==candidate[3])
        throw new Error('A votação municipal não corresponde ao total estadual do candidato. Atualize os dados.');
      const previous=regional.previousElectionYear===2022?getPrevious(candidate):null,priorMap=new Map((previous?.[6]||[]).map(([code,votes])=>[String(code),Number(votes)]));
      const previousFor=code=>previous&&priorCoverage.has(code)?priorMap.get(code)||0:null,previousValues=codes.map(previousFor);
      return {slot,color:colors[slot],candidate,ballotName:ballotName(candidate)||candidate[2],rows:[],previousRows:null,previous,previousFor,currentMap,
        votes:candidate[3],previousVotes:previous&&previousValues.every(v=>v!==null)?previousValues.reduce((n,v)=>n+v,0):null};
    });
    const municipalities=index.municipalities.map(m=>{const code=String(m[0]);return {code,name:m[1],regionId:regionOf.get(code),region:regionNames.get(regionOf.get(code))||'Região não informada',
      nominal:Number(m[5])||0,values:selections.map(s=>s.currentMap.get(code)||0),previousValues:selections.map(s=>s.previousFor(code))};});
    const city={m:['__state__','Todos os municípios do Pará'],isRegional:true,isStatewide:true,municipalityCodes:codes};
    return {office,city,index,regional,filters:{},codes,selections,municipalities,zoneRows:[],nominal,hasFilters:false};
  }
  function query({office,city,index,regional,candidateIds,filters={},getPrevious=()=>null,getHistory=()=>null,ballotName=()=>''}){
    if(!offices[office]||city?.o!==office||index?.office!==office||regional?.office!==office||city.y!==2026||index.electionYear!==2026||regional.currentElectionYear!==2026)
      throw new Error('Use uma única base de 2026 e o mesmo cargo para os dois candidatos.');
    const ids=(candidateIds||[]).filter(Boolean).map(String);
    if(ids.length>2||new Set(ids).size!==ids.length)throw new Error('Selecione dois candidatos diferentes do mesmo cargo.');
    const candidates=ids.map(id=>city.c.find(c=>String(c[0])===id));
    if(candidates.some(c=>!c))throw new Error('Um candidato não pertence ao cargo e recorte ativos. Selecione novamente.');
    let codes=(city.isRegional?city.municipalityCodes:[city.m[0]]).map(String);const allowed=new Set(codes);
    const names=new Map(index.municipalities.map(m=>[String(m[0]),m]));
    const regionOf=new Map(regional.municipalities.map(m=>[String(m[0]),String(m[2])])),regionNames=new Map(regional.regions.map(r=>[String(r[0]),r[1]]));
    const hasFilters=Object.values(filters).some(Boolean),metadata=city.s.map((s,i)=>({index:i,municipalityCode:String(s[4]||city.m[0]),zone:String(s[0]),section:String(s[1]),place:String(s[2]||''),neighborhood:String(s[3]||'')}));
    const sections=metadata.filter(r=>allowed.has(r.municipalityCode)&&matches(r,filters)),sectionIds=new Set(sections.map(r=>r.index));
    if(hasFilters){const covered=new Set(sections.map(r=>r.municipalityCode));codes=codes.filter(code=>covered.has(code));}
    const nominal=new Map(codes.map(code=>[code,hasFilters?0:Number(names.get(code)?.[5])||0]));
    if(hasFilters)for(const c of city.c)for(const [i,votes]of c[5])if(sectionIds.has(i)){const code=metadata[i].municipalityCode;nominal.set(code,nominal.get(code)+votes);}
    const priorCoverage=new Set((regional.totals?.previousMunicipalities||[]).map(([code])=>String(code)));
    const selections=candidates.map((candidate,slot)=>{
      const rows=candidate[5].filter(([i])=>sectionIds.has(i)).map(([i,votes])=>({...metadata[i],votes}));
      const previous=regional.previousElectionYear===2022?getPrevious(candidate):null,history=previous?getHistory(candidate):null;
      const prior=previous&&!filters.neighborhood&&Array.isArray(history)?history.filter(r=>allowed.has(String(r.municipalityCode))&&matches(r,filters)):null;
      const currentMap=new Map(),priorMap=new Map();
      for(const row of rows)currentMap.set(row.municipalityCode,(currentMap.get(row.municipalityCode)||0)+row.votes);
      if(!hasFilters&&previous)for(const [code,votes]of previous[6]||[])priorMap.set(String(code),votes);
      else for(const row of prior||[])priorMap.set(String(row.municipalityCode),(priorMap.get(String(row.municipalityCode))||0)+row.votes);
      const previousFor=code=>!previous?null:!hasFilters?(priorCoverage.has(code)?priorMap.get(code)||0:null):(priorMap.has(code)?priorMap.get(code):null);
      const previousValues=codes.map(previousFor);
      return {slot,color:colors[slot],candidate,ballotName:ballotName(candidate)||candidate[2],rows,previousRows:prior,previous,previousFor,currentMap,
        votes:sum(rows),previousVotes:previous&&previousValues.length&&previousValues.every(v=>v!==null)?previousValues.reduce((n,v)=>n+v,0):null};
    });
    const municipalities=codes.map(code=>({code,name:names.get(code)?.[1]||code,regionId:regionOf.get(code),region:regionNames.get(regionOf.get(code))||'Região não informada',
      nominal:nominal.get(code)||0,values:selections.map(s=>s.currentMap.get(code)||0),previousValues:selections.map(s=>s.previousFor(code))}));
    const zoneKeys=[...new Set(sections.map(r=>r.zone))].sort((a,b)=>Number(a)-Number(b));
    const zoneTotals=selections.map(s=>{const totals=new Map();for(const r of s.rows)totals.set(r.zone,(totals.get(r.zone)||0)+r.votes);return totals;});
    const previousZones=selections.map(s=>{const totals=new Map();for(const r of s.previousRows||[]){const key=padded(r.zone);totals.set(key,(totals.get(key)||0)+r.votes);}return totals;});
    const zoneRows=zoneKeys.map(zone=>({key:zone,label:'Zona '+zone,values:zoneTotals.map(totals=>totals.get(zone)||0),
      previousValues:previousZones.map(totals=>totals.has(padded(zone))?totals.get(padded(zone)):null)}));
    return {office,city,index,regional,filters,codes,selections,municipalities,zoneRows,nominal:[...nominal.values()].reduce((n,v)=>n+v,0),hasFilters};
  }
  function build({data,mode='scope',layout='consolidated',generatedAt=new Date().toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})}){
    if(data.selections.length!==2)throw new Error('Selecione dois candidatos diferentes do mesmo cargo antes de gerar o relatório.');
    if(!data.municipalities.length)throw new Error('Nenhuma seção corresponde ao filtro. Revise a zona, seção, escola ou bairro.');
    if(!['scope','top30','complete'].includes(mode))throw new Error('Formato de relatório indisponível.');
    const {selections,filters}=data,ordered=[...data.municipalities].sort((a,b)=>b.values.reduce((n,v)=>n+v,0)-a.values.reduce((n,v)=>n+v,0)||a.name.localeCompare(b.name,'pt-BR'));
    const rows=mode==='top30'?ordered.slice(0,30):[...data.municipalities].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    const source=data.index.provenance?.appliedAt?data.index.source+' • atualizada em '+new Date(data.index.provenance.appliedAt).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}):data.index.source;
    const report={title:'Relatório comparativo • '+(mode==='top30'?'Top 30 municípios':mode==='complete'&&data.city.isStatewide?'Todos os municípios do Pará':mode==='complete'?'Completo do recorte':'Recorte selecionado'),
      subtitle:selections.map(s=>s.candidate[1]+' — '+s.ballotName).join(' × '),electionYear:2026,turn:1,generatedAt,compactIndicators:true,indicatorColumns:2,
      meta:[['Cargo',offices[data.office]],['Município / recorte',data.city.m[1]],['Filtro',Object.entries(filters).filter(([,v])=>v).map(([k,v])=>({zone:'Zona',section:'Seção',place:'Local',neighborhood:'Bairro'}[k])+': '+v).join(' • ')||(data.city.isStatewide?'Todas as zonas do Pará':'Todas as zonas do recorte')],
        ['Conteúdo',rows.length+' de '+data.municipalities.length+' municípios'+(mode==='top30'?' • ordenados pela soma de votos dos dois selecionados':' • ordem alfabética')],['Fonte 2026',source]],
      indicators:selections.map(s=>({label:s.candidate[1]+' • '+s.ballotName,value:integer(s.votes)+' votos',note:(data.nominal>0?percent(s.votes/data.nominal*100)+' dos votos nominais do cargo no filtro':'Sem base percentual no filtro')+(s.previousVotes==null?'':' • '+change(s.votes,s.previousVotes)+' vs. 2022')})),blocks:[],
      note:'Verde (+): aumento de votos desde 2022; vermelho (-): queda. Diferença de votos = 2026 - 2022; variação % = diferença ÷ votos de 2022 × 100. Azul e roxo identificam os candidatos; cinza indica 2022. “—”: histórico indisponível. Com zero em 2022, mostramos a diferença em votos, sem calcular uma porcentagem. A participação nominal usa os votos nominais do próprio cargo no filtro.'};
    for(const s of selections){report.meta.push([s.candidate[1]+' • nome completo',s.candidate[2]]);if(s.previous)report.meta.push([s.candidate[1]+' • correspondência 2022',s.previous[2]+' • mesmo cargo e 1º turno']);}
    if(selections.some(s=>s.previous))report.meta.push(['Fonte 2022',data.regional.sources.previous]);
    if(data.hasFilters)report.note+=' O recorte de zona, seção ou escola só recebe histórico quando há dados correspondentes. Bairro: somente 2026.';
    if(mode==='top30')report.note+=' Os totais do resumo abrangem o filtro inteiro; a tabela mostra apenas os municípios do Top 30.';
    const card=row=>({type:'duel',title:row.name+' • '+row.region,candidates:selections.map((s,i)=>({name:s.ballotName,number:s.candidate[1],color:s.color,votes:row.values[i],
      share:row.nominal?percent(row.values[i]/row.nominal*100):'Sem base %',previous:row.previousValues[i],change:voteChange(row.values[i],row.previousValues[i]).percentLabel,
      difference:row.previousValues[i]==null?'Sem histórico no recorte':signed(row.values[i]-row.previousValues[i])+' votos vs. 2022'}))});
    const table=(title,list)=>report.blocks.push({type:'table',title,compact:true,headers:['Município',...selections.flatMap(s=>[s.candidate[1]+' 2026',s.candidate[1]+' 2022','Diferença: votos e %']),'Gráfico'],
      widths:[2.5,...selections.flatMap(()=>[.8,.8,1.6]),1.5],rows:list.map(r=>[r.name,...selections.flatMap((s,i)=>[integer(r.values[i]),r.previousValues[i]==null?'—':integer(r.previousValues[i]),change(r.values[i],r.previousValues[i])]),'']),
      pairedComparison:list.map(r=>({values:r.values,previousValues:r.previousValues,colors:selections.map(s=>s.color)}))});
    if(mode==='scope')report.indicators=[];
    if(mode==='scope'&&rows.length===1){report.blocks.push(card(rows[0]));
      if(data.zoneRows.length>1)report.blocks.push({type:'table',title:'Zonas do município • 2026',compact:true,headers:['Zona',...selections.map(s=>s.candidate[1]+' • votos')],widths:[2,1,1],rows:data.zoneRows.map(r=>[r.label,...r.values.map(integer)])});
    }else if(mode==='scope'){
      report.blocks.push({type:'duel',title:data.city.m[1],candidates:selections.map(s=>({name:s.ballotName,number:s.candidate[1],color:s.color,votes:s.votes,share:data.nominal?percent(s.votes/data.nominal*100):'Sem base %',previous:s.previousVotes,change:voteChange(s.votes,s.previousVotes).percentLabel,difference:s.previousVotes==null?'Sem histórico no recorte':signed(s.votes-s.previousVotes)+' votos vs. 2022'}))});
      table('Municípios do recorte',rows);
    }else if(mode==='complete'&&layout==='regions'){
      const regions=[...new Set(rows.map(r=>r.region))].sort((a,b)=>a.localeCompare(b,'pt-BR'));for(const region of regions)table(region+' • municípios',rows.filter(r=>r.region===region));
    }else table(mode==='top30'?'Top 30 municípios do filtro':data.city.isStatewide?'Todos os municípios do Pará':'Todos os municípios do filtro',rows);
    return report;
  }
  const api={query,statewideQuery,build,normalizeSelection,change};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ComparisonReport=api;
})(typeof window!=='undefined'?window:globalThis);
