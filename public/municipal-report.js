(function(root,factory){
  'use strict';
  if(typeof module!=='undefined'&&module.exports)module.exports=factory(require('./election-scope.js'));
  else root.MunicipalReport=factory(root.ElectoralScope);
})(typeof window!=='undefined'?window:globalThis,function(S){
  'use strict';
  const int=v=>new Intl.NumberFormat('pt-BR').format(v);
  const pct=v=>new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}).format(v);
  function build({office,candidate,index,statewide,regional,cityCodes,ballotName='',generatedAt}){
    if(index.electionYear!==2026||statewide.electionYear!==2026||regional.currentElectionYear!==2026||regional.previousElectionYear!==2022||[index,statewide,regional].some(b=>b.office!==office))throw new Error('As bases do relatório precisam corresponder ao mesmo cargo e à eleição de 2026.');
    const current=statewide.candidates.find(c=>String(c[0])===String(candidate?.[0])&&String(c[1])===String(candidate?.[1])&&c[2]===candidate?.[2]);
    if(!current)throw new Error('Candidato indisponível nesta base.');
    const allowed=new Set((cityCodes||index.municipalities.map(c=>c[0])).map(String));
    const cities=index.municipalities.filter(c=>allowed.has(String(c[0])));
    if(!cities.length||cities.length!==allowed.size)throw new Error('Recorte municipal indisponível nesta base.');
    const previous=S.previousCandidate(current,regional.previousCandidates,statewide.candidates);
    const votes=new Map(current[6].map(([code,v])=>[String(code),v])),oldVotes=new Map((previous?.[6]||[]).map(([code,v])=>[String(code),v]));
    const rows=cities.map(c=>({name:c[1],votes:Number(votes.get(String(c[0])))||0,nominal:Number(c[5])||0,previous:previous?Number(oldVotes.get(String(c[0])))||0:null})).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name,'pt-BR'));
    const total=rows.reduce((n,r)=>n+r.votes,0),prior=previous?rows.reduce((n,r)=>n+r.previous,0):null,nominal=rows.reduce((n,r)=>n+r.nominal,0);
    const regionIds=new Set(regional.municipalities.filter(c=>allowed.has(String(c[0]))).map(c=>String(c[2])));
    const region=regionIds.size===1?regional.regions.find(r=>String(r[0])===[...regionIds][0])?.[1]:'';
    const scope=cities.length===144?'Todos os 144 municípios do Pará':cities.length===1?cities[0][1]:`${region||'Recorte selecionado'} • ${int(cities.length)} municípios`;
    const metric=(label,value,note)=>({label,value,note});
    const indicators=[metric('Votos 2026',int(total)),metric('Participação no recorte',pct(total/Math.max(1,nominal)),'nos votos nominais do mesmo cargo'),metric('Municípios com votos',int(rows.filter(r=>r.votes>0).length),`de ${int(rows.length)} municípios`),metric('Concentração Top 30',pct(rows.slice(0,30).reduce((n,r)=>n+r.votes,0)/Math.max(1,total)))];
    if(previous)indicators.push(metric('Votos 2022',int(prior)),metric('Variação de votos',S.change(total,prior).label),metric('Municípios em alta',int(rows.filter(r=>r.votes>r.previous).length)),metric('Municípios em queda',int(rows.filter(r=>r.votes<r.previous).length)));
    const bars=rows.slice(0,30).map(r=>({label:r.name,values:[{label:'2026',value:r.votes,color:'#1262ae'},...(previous?[{label:'2022',value:r.previous,color:'#9cacbf'}]:[])],change:previous?S.change(r.votes,r.previous).label:''}));
    const pieRows=rows.slice(0,9),others=rows.slice(9);
    const pie=year=>[...pieRows.map(r=>({label:r.name,value:year===2026?r.votes:r.previous})),...(others.length?[{label:'Demais municípios',value:others.reduce((n,r)=>n+(year===2026?r.votes:r.previous),0)}]:[])];
    return {title:'Votação do candidato por município',subtitle:`${current[1]} — ${current[2]}`,generatedAt:generatedAt||new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),
      meta:[['Cargo',office==='federal'?'Deputado Federal':'Deputado Estadual'],['Eleição','2026 • 1º turno • Pará'],['Abrangência do Raio-X',scope],['Nome de urna',ballotName||'Não disponível nesta consulta'],['Fonte 2026',index.source],...(previous?[['Fonte 2022',regional.sources.previous],['Nome em 2022',previous[2]]]:[])],
      indicators,note:(previous?'Comparação com 2022 confirmada por nome completo normalizado único, mesmo cargo e turno. Variação (%) = (votos de 2026 − votos de 2022) ÷ votos de 2022 × 100. Verde: aumento; vermelho: queda. Com zero votos em 2022, não há base percentual.':'Somente 2026: sem correspondência histórica única confirmada em 2022 neste cargo. Isso não comprova que seja a primeira candidatura.')+' O relatório inclui todos os municípios do recorte, inclusive os sem votos, em ordem decrescente. A participação municipal divide os votos do candidato pelos votos nominais do cargo no município. Os resultados abrangem todas as zonas e seções de cada município.',
      blocks:[{type:'bars',title:'Top 30 municípios • Ordem decrescente de votos',rows:bars},{type:'pie',title:'Distribuição municipal • 2026',rows:pie(2026)},...(previous?[{type:'pie',title:'Distribuição municipal • 2022',rows:pie(2022)}]:[]),
        {type:'table',title:'Todos os municípios do recorte',headers:['#','Município','Votos 2026','% municipal','Votos 2022','Variação'],rows:rows.map((r,i)=>[int(i+1),r.name,int(r.votes),pct(r.votes/Math.max(1,r.nominal)),previous?int(r.previous):'—',previous?S.change(r.votes,r.previous).label:'—']),widths:[.5,2.5,1,1.1,1,1.4],compact:true}]};
  }
  return {build};
});
