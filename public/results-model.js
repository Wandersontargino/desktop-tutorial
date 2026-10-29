(function(root){
  'use strict';
  const offices={estadual:'Deputado Estadual',federal:'Deputado Federal',governador:'Governador',senador:'Senador',presidente:'Presidente'};
  const namesCache=new WeakMap(),coverageCache=new WeakMap();
  const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
  const number=n=>new Intl.NumberFormat('pt-BR').format(n);
  const percent=n=>n==null?'—':n.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
  const voteChange=typeof module!=='undefined'&&module.exports?require('./election-scope.js').change:(current,previous)=>root.ElectoralScope.change(current,previous);
  function statusGroup(status){const s=normalize(status);return s==='SUPLENTE'?'suplente':s==='NAO ELEITO'?'nao-eleito':s.startsWith('ELEITO')?'eleito':s.includes('TURNO')?'segundo-turno':'indisponivel';}
  function identity(metadata,candidate){return metadata&&String(metadata.id)===String(candidate.id)&&String(metadata.number)===String(candidate.number)&&normalize(metadata.fullName)===normalize(candidate.fullName)?metadata:null;}
  function validate(data){
    if(data?.schema!==1||data.electionYear!==2026||data.turn!==1||data.uf!=='PA'||data.regions?.length!==13||data.municipalities?.length!==144)throw new Error('Resultados de ano, turno ou território incompatíveis.');
    const codes=new Set(data.municipalities.map(r=>String(r[0]))),regions=new Set(data.regions.map(r=>String(r[0])));
    if(codes.size!==144||regions.size!==13||data.municipalities.some(r=>!regions.has(String(r[2]))))throw new Error('Divisão regional inválida.');
    for(const office of Object.keys(offices)){
      const d=data.offices?.[office];if(d?.electionYear!==2026||d.turn!==1||d.uf!=='PA'||d.office!==office)throw new Error('Cargo incompatível na fonte.');
      const zones=new Set(),sums=new Map(),ids=new Set();let total=0;
      for(const row of d.context){const key=row.municipality+'|'+row.zone;if(!codes.has(row.municipality)||zones.has(key)||!/^\d+$/.test(row.zone))throw new Error('Zona duplicada ou inválida.');zones.add(key);for(const field of ['eligible','attendance','abstention','votes','valid','nominal','partyVotes','blank','null','sections','notInstalled'])if(row[field]!==null&&(!Number.isSafeInteger(row[field])||row[field]<0))throw new Error('Indicador eleitoral inválido.');if(row.eligible!==row.attendance+row.abstention)throw new Error('Comparecimento divergente.');}
      for(const c of d.candidates){if(ids.has(c.id)||!/^\d+$/.test(c.id)||!c.number||!c.fullName||!Number.isSafeInteger(c.votes)||c.votes<0)throw new Error('Candidatura inválida.');ids.add(c.id);let sum=0;const seen=new Set();for(const [m,z,v] of c.rows){const key=m+'|'+z;if(!zones.has(key)||seen.has(key)||!Number.isSafeInteger(v)||v<=0)throw new Error('Distribuição inválida.');seen.add(key);sum+=v;sums.set(key,(sums.get(key)||0)+v);}if(sum!==c.votes)throw new Error('Total do candidato divergente.');total+=sum;}
      if(total!==d.totalVotes||d.contextReconciled!==true||d.context.some(r=>(sums.get(r.municipality+'|'+r.zone)||0)!==r.nominal))throw new Error('A votação nominal não confere com o contexto oficial.');
    }return data;
  }
  function fromActive(active,snapshot){
    if(active?.electionYear!==2026||active.turn!==1||active.uf!=='PA'||!['estadual','federal'].includes(active.office)||active.office!==snapshot.office)throw new Error('Base ativa incompatível.');
    const metadata=new Map(snapshot.candidates.map(c=>[c.id,c]));
    return {...active,denominator:'nominal-active',context:snapshot.context,candidates:active.candidates.map(c=>{const m=identity(metadata.get(c.id),c);return {...c,ballotName:c.ballotName||m?.ballotName||'',party:typeof c.party==='object'?c.party?.sigla||m?.party||'':c.party||m?.party||'',status:m?.status||'Não disponível',statusCode:m?.statusCode||''};})};
  }
  function scope(data,filters={}){return data.municipalities.filter(r=>(!filters.region||String(r[2])===filters.region)&&(!filters.municipality||String(r[0])===filters.municipality));}
  function distribution(candidate,allowed,zone){return candidate.rows.filter(([m,z])=>allowed.has(String(m))&&(!zone||String(z)===zone));}
  function previousFor(current,previous,candidate){
    if(!previous||previous.electionYear!==2022||previous.office!==current.office||previous.turn!==1||previous.uf!=='PA')return null;
    const names=d=>{if(!namesCache.has(d)){const map=new Map();for(const c of d.candidates){const key=normalize(c.fullName);map.set(key,map.has(key)?null:c);}namesCache.set(d,map);}return namesCache.get(d);};
    const name=normalize(candidate.fullName);return names(current).get(name)?names(previous).get(name)||null:null;
  }
  function previousCoverage(previous,current,allowed,zone){
    if(!previous)return false;if(!coverageCache.has(previous)){const rows=previous.zones||previous.candidates.flatMap(c=>c.rows);coverageCache.set(previous,{zones:new Set(rows.map(([m,z])=>m+'|'+z)),municipalities:new Set(rows.map(([m])=>String(m)))});}
    const coverage=coverageCache.get(previous);if(zone)return current.context.filter(r=>allowed.has(r.municipality)&&r.zone===zone).every(r=>coverage.zones.has(r.municipality+'|'+r.zone));
    return [...allowed].every(m=>coverage.municipalities.has(m));
  }
  function query(territory,data,filters={},previous=null){
    const municipalities=scope(territory,filters),allowed=new Set(municipalities.map(r=>String(r[0])));
    const context=data.context.filter(r=>allowed.has(r.municipality)&&(!filters.zone||r.zone===filters.zone));
    const totals={};for(const key of ['eligible','attendance','abstention','votes','valid','nominal','partyVotes','blank','null','sections','notInstalled'])totals[key]=context.length&&context.every(r=>r[key]!==null)?context.reduce((n,r)=>n+r[key],0):null;
    let total=0;const covered=previousCoverage(previous,data,allowed,filters.zone);
    const ranked=data.candidates.map(candidate=>{const rows=distribution(candidate,allowed,filters.zone),votes=rows.reduce((n,r)=>n+r[2],0);total+=votes;const prior=covered?previousFor(data,previous,candidate):null,old=prior?distribution(prior,allowed,filters.zone).reduce((n,r)=>n+r[2],0):null;return {...candidate,scopeRows:rows,scopeVotes:votes,coverage:new Set(rows.map(r=>r[0])).size,previousVotes:old,change:old>0?(votes-old)/old*100:null,difference:voteChange(votes,old).difference};}).sort((a,b)=>b.scopeVotes-a.scopeVotes||normalize(a.ballotName||a.fullName).localeCompare(normalize(b.ballotName||b.fullName),'pt-BR'));
    let rank=0,last=null;ranked.forEach((r,i)=>{if(r.scopeVotes!==last)rank=i+1;r.rank=rank;last=r.scopeVotes;r.share=total?r.scopeVotes/total*100:null;});
    const term=normalize(filters.term);const visible=ranked.filter(c=>(!filters.party||c.party===filters.party)&&(!filters.status||statusGroup(c.status)===filters.status)&&(!term||normalize(c.number+' '+c.fullName+' '+c.ballotName).includes(term)));
    return {municipalities,allowed,totals,total,ranked,visible,context,contextMatches:totals.nominal===total};
  }
  function municipal(territory,data,candidate,filters,previous){
    const old=previousFor(data,previous,candidate),rows=scope(territory,filters).map(([code,name,region])=>{const sum=c=>c.rows.filter(([m,z])=>String(m)===String(code)&&(!filters.zone||String(z)===filters.zone)).reduce((n,r)=>n+r[2],0);const votes=sum(candidate),previousVotes=old&&previousCoverage(previous,data,new Set([String(code)]),filters.zone)?sum(old):null;return {code:String(code),name,region,votes,previousVotes,change:previousVotes>0?(votes-previousVotes)/previousVotes*100:null,difference:voteChange(votes,previousVotes).difference};});return rows.sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name,'pt-BR'));
  }
  function report(territory,data,filters,result,candidate,previous,sources){
    const names=scope(territory,filters),scopeName=filters.municipality?names[0]?.[1]:filters.region?territory.regions.find(r=>String(r[0])===filters.region)?.[1]:'Todos os municípios do Pará';
    const list=candidate?[result.ranked.find(c=>c.id===candidate.id)]:result.visible.slice(0,20),colors=['#5637da','#afbded'];
    const rows=list.filter(Boolean),blocks=[{type:'bars',title:'Votação no recorte',legend:[{label:'2026',color:colors[0]},{label:'2022 — quando comparável',color:colors[1]}],rows:rows.slice(0,10).map(r=>({label:r.ballotName||r.fullName,values:[{label:'2026',value:r.scopeVotes,color:colors[0]},...(r.previousVotes===null?[]:[{label:'2022',value:r.previousVotes,color:colors[1]}])],change:r.previousVotes==null?'':voteChange(r.scopeVotes,r.previousVotes).label}))},
      {type:'table',title:'Resultados no recorte',headers:['Candidato','Partido','Situação oficial','Votos 2026','% nominal','Votos 2022','Diferença: votos e %'],widths:[2.3,.7,1.3,.9,.8,.9,1.8],rows:rows.map(r=>[r.number+' — '+(r.ballotName||r.fullName),r.party,r.status,number(r.scopeVotes),percent(r.share),r.previousVotes===null?'—':number(r.previousVotes),voteChange(r.scopeVotes,r.previousVotes).label])}];
    if(candidate){const cities=municipal(territory,data,candidate,filters,previous);blocks.push({type:'table',title:'Votação por município',headers:['Município','Votos 2026','Votos 2022','Diferença: votos e %'],widths:[2.5,1,1,1.8],rows:cities.map(r=>[r.name,number(r.votes),r.previousVotes===null?'—':number(r.previousVotes),voteChange(r.votes,r.previousVotes).label])});}
    const t=result.totals;blocks.push({type:'table',title:'Contexto oficial do eleitorado',headers:['Indicador','Quantidade'],weights:[3,2],rows:[['Eleitorado apto',number(t.eligible)],['Comparecimento',number(t.attendance)],['Abstenções',number(t.abstention)],['Votos brancos',number(t.blank)],['Votos nulos',number(t.null)],['Votos de legenda',number(t.partyVotes)]]});
    return {electionYear:2026,turn:1,title:candidate?'Votação do candidato':'Resumo dos resultados',subtitle:offices[data.office]+' • '+scopeName,generatedAt:new Date().toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}),compactIndicators:true,meta:[['Eleição','2026 • 1º turno • Pará'],['Região',filters.region?scopeName:'Todas'],['Município',filters.municipality?scopeName:'Todos do recorte'],['Zona',filters.zone||'Todas'],['Situação',filters.status||'Todas'],['Fonte dos votos',data.source?.generation||sources.nominal.generation.join('; ')],['Fonte do contexto',sources.context.generation.join('; ')]],indicators:[{label:'Votos nominais no recorte',value:number(result.total)},{label:'Municípios no recorte',value:number(names.length)},{label:'Candidatos encontrados',value:number(result.visible.length)}],note:'Percentuais do ranking usam todos os votos nominais do cargo no recorte, antes dos filtros de candidato, partido ou situação. Situação oficial refere-se à eleição do cargo, não ao ranking municipal. '+(candidate?'Todos os municípios do recorte estão na tabela.':'Resumo limitado aos 20 primeiros resultados; a exportação CSV inclui toda a lista filtrada.')+' Histórico apenas com nome completo único no mesmo cargo e turno. Contexto oficial tem fonte e data próprias.'+(data.office==='senador'?' Senador: duas escolhas por eleitor em 2026; votos não equivalem a quantidade de pessoas.':''),blocks};
  }
  const api={offices,normalize,statusGroup,identity,validate,fromActive,scope,previousFor,query,municipal,report,voteChange};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ResultsModel=api;
})(typeof window!=='undefined'?window:globalThis);
