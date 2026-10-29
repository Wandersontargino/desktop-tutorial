(function(root){
  'use strict';
  const order=['I','II','III','IV'];
  const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const sum=(rows,key)=>rows.reduce((n,row)=>n+row[key],0);
  const fmt=value=>new Intl.NumberFormat('pt-BR').format(value);
  const pct=value=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2}).format(value)+'%';
  const statusLabel=status=>status==='elected'?'Titular eleito':'Suplente';
  function validate(data){
    const fail=()=>{throw new Error('A base do Conselho Tutelar de Ananindeua de 2023 não passou pela conferência.');};
    if(data?.schemaVersion!==1||data.year!==2023||data.municipality!=='Ananindeua'||data.electionDate!=='2023-10-01'||data.homologationDate!=='2023-10-20')fail();
    if(![data.councils,data.candidates,data.poles,data.associated].every(Array.isArray))fail();
    if(data.councils.map(c=>c.id).join(',')!==order.join(',')||data.candidates.length!==131||data.poles.length!==34||data.associated.length!==124)fail();
    if(new Set(data.candidates.map(c=>c.id)).size!==data.candidates.length||new Set(data.poles.map(p=>p.id)).size!==34)fail();
    for(const council of data.councils){
      const rows=data.candidates.filter(c=>c.council===council.id),r=council.reported;
      if(rows.length!==council.candidateCount||rows.filter(c=>c.status==='elected').length!==5)fail();
      if(!Object.values(r).every(n=>Number.isSafeInteger(n)&&n>=0)||r.valid+r.blank+r.null+r.annulled!==r.attendance)fail();
      if(sum(rows,'votes')-r.valid!==council.declaredDifference||council.declaredDifference!==(council.id==='II'?5:0))fail();
      if(rows.map(c=>c.rank).sort((a,b)=>a-b).some((rank,i)=>rank!==i+1))fail();
    }
    for(const c of data.candidates)if(!order.includes(c.council)||c.id!==c.council+':'+c.number||!/^\d{3}$/.test(c.number)||!c.name||!Number.isSafeInteger(c.votes)||c.votes<0||!['elected','substitute'].includes(c.status)||c.status!==(c.rank<=5?'elected':'substitute'))fail();
    for(const p of data.poles)if(!order.includes(p.council)||p.id!==p.council+':'+p.number||!p.name||!p.address)fail();
    for(const a of data.associated)if(!data.poles.some(p=>p.id===a.poleId&&p.council===a.council)||!a.name||typeof a.sections!=='string')fail();
    if(data.annulment?.votes!==348||data.annulment.urn!=='031'||data.annulment.poleId!=='II:09'||data.coverage?.schoolVotes!==false||data.coverage.electoralZones!==false)fail();
    return data;
  }
  function scope(data,council=''){
    const councils=data.councils.filter(c=>!council||c.id===council);
    if(!councils.length)throw new Error('Escolha um conselho disponível.');
    const ids=new Set(councils.map(c=>c.id)),candidates=data.candidates.filter(c=>ids.has(c.council));
    const reported=Object.fromEntries(['valid','blank','null','annulled','attendance'].map(key=>[key,councils.reduce((n,c)=>n+c.reported[key],0)]));
    return {councils,candidates,reported,nominal:sum(candidates,'votes'),difference:sum(candidates,'votes')-reported.valid,poles:data.poles.filter(p=>ids.has(p.council)),associated:data.associated.filter(a=>ids.has(a.council))};
  }
  function candidate(data,id){
    const value=data.candidates.find(c=>c.id===id);if(!value)return null;
    const denominator=sum(data.candidates.filter(c=>c.council===value.council),'votes');
    const fifth=data.candidates.find(c=>c.council===value.council&&c.rank===5);
    return {...value,denominator,share:value.votes/denominator*100,fifthVotes:fifth?.votes??null,differenceToFifth:fifth?value.votes-fifth.votes:null};
  }
  function candidates(data,filters={}){
    const term=normalize(filters.search);
    return scope(data,filters.council).candidates.filter(c=>(!filters.status||c.status===filters.status)&&(!term||normalize(c.number+' '+c.name).includes(term))).map(c=>candidate(data,c.id)).sort((a,b)=>order.indexOf(a.council)-order.indexOf(b.council)||a.rank-b.rank);
  }
  function schools(data,filters={}){
    const term=normalize(filters.schoolSearch);
    return scope(data,filters.council).poles.filter(p=>!filters.pole||p.id===filters.pole).map(p=>{
      const all=data.associated.filter(a=>a.poleId===p.id),direct=normalize(p.name+' '+p.address+' '+p.number).includes(term);
      const associated=!term||direct?all:all.filter(a=>normalize(a.name+' '+a.sections).includes(term));
      return {...p,associated,associationCount:all.length};
    }).filter(p=>!term||p.associated.length);
  }
  function compare(data,a,b){
    const left=candidate(data,a),right=candidate(data,b);
    if(!left||!right)throw new Error('Selecione dois candidatos.');
    if(left.id===right.id)throw new Error('Escolha candidatos diferentes.');
    if(left.council!==right.council)throw new Error('A comparação exige candidatos do mesmo conselho.');
    return {left,right,difference:left.votes-right.votes,shareDifference:left.share-right.share};
  }
  function sourceNote(data,council=''){
    const s=scope(data,council),notes=['Votação por conselho e candidato na homologação de 20/10/2023.'];
    if(s.difference)notes.push('Conselho II: soma das candidaturas = 13.121; válidos publicados = 13.116. Diferença de 5 votos preservada.');
    if(s.reported.annulled)notes.push('Urna 031, polo 09, EEEF Antônio Gondim Lins: 348 votos anulados já considerados na publicação.');
    notes.push('Percentual do candidato = votos / soma nominal das candidaturas do mesmo conselho. Não há votação por escola ou urna nesta relação.');
    return notes.join(' ');
  }
  function competition(data,council=''){
    return scope(data,council).councils.map(c=>{
      const rows=data.candidates.filter(r=>r.council===c.id),topFive=rows.filter(r=>r.rank<=5),fifth=rows.find(r=>r.rank===5),sixth=rows.find(r=>r.rank===6),nominal=sum(rows,'votes');
      return {council:c.id,nominal,topFiveVotes:sum(topFive,'votes'),topFiveShare:sum(topFive,'votes')/nominal*100,fifth,sixth,gap:fifth&&sixth?fifth.votes-sixth.votes:null};
    });
  }
  function report(data,filters={},kind='summary',selection={}){
    const s=scope(data,filters.council),rows=candidates(data,filters),poles=schools(data,filters);
    const base={electionYear:2023,headerSubtitle:'Conselho Tutelar · Ananindeua · 2023',title:'Conselho Tutelar de Ananindeua',subtitle:'Eleição de 01/10/2023. Homologação de 20/10/2023.',generatedAt:new Date().toLocaleString('pt-BR'),compactIndicators:true,
      meta:[['Conselho',filters.council?'Conselho Tutelar '+filters.council:'Todos os quatro conselhos'],['Fonte',data.sources.results.title],['Candidatos',filters.status?statusLabel(filters.status):'Todas as situações'],['Busca',kind==='schools'?filters.schoolSearch||'Sem busca':filters.search||'Sem busca']],
      sources:[data.sources.results.url,data.sources.schools.url],note:sourceNote(data,filters.council),
      indicators:[{label:'Válidos publicados',value:fmt(s.reported.valid)},{label:'Comparecimento',value:fmt(s.reported.attendance)},{label:'Candidatos no filtro',value:fmt(rows.length)},{label:'Polos no conselho',value:fmt(s.poles.length)}],blocks:[]};
    const bar=c=>({label:c.number+' '+c.name,values:[{label:'CT '+c.council,value:c.votes,color:c.status==='elected'?'#2563eb':'#7c3aed'}]});
    if(kind==='candidate'){
      const left=candidate(data,selection.a);if(!left)throw new Error('Escolha um candidato para o relatório.');
      const comparison=selection.b?compare(data,selection.a,selection.b):null,list=comparison?[comparison.left,comparison.right]:[left];
      base.meta=[['Conselho','Conselho Tutelar '+left.council],['Fonte',data.sources.results.title],['Percentual','Sobre a soma nominal das candidaturas do mesmo conselho']];base.note=sourceNote(data,left.council);base.sources=[data.sources.results.url];
      base.indicators=list.map(c=>({label:c.name,value:fmt(c.votes)+' votos'}));
      if(comparison)base.indicators.push({label:'Diferença A − B',value:(comparison.difference>0?'+':'')+fmt(comparison.difference)+' votos'});
      base.blocks=[{type:'bars',title:comparison?'Comparação no mesmo conselho':'Votação do candidato',rows:list.map(bar)},{type:'table',title:'Resultado homologado',headers:['Candidato','Votos','% nominal','Posição','Situação'],widths:[3.3,1,1,0.8,1.4],rows:list.map(c=>[c.number+' '+c.name,fmt(c.votes),pct(c.share),c.rank+'º',statusLabel(c.status)])}];
      base.finalResult={title:comparison?'Diferença entre os candidatos':'Votação do candidato',summary:comparison?fmt(comparison.left.votes)+' × '+fmt(comparison.right.votes)+' votos':fmt(left.votes)+' votos',detail:'Conselho Tutelar '+left.council+'. Resultado homologado em 20/10/2023.'};
      return base;
    }
    if(kind==='schools'){
      base.meta=[['Conselho',filters.council?'Conselho Tutelar '+filters.council:'Todos os quatro conselhos'],['Fonte',data.sources.schools.title],['Busca',filters.schoolSearch||'Sem busca'],['Polo',filters.pole?data.poles.find(p=>p.id===filters.pole)?.name||filters.pole:'Todos do recorte']];base.sources=[data.sources.schools.url];
      base.indicators=[{label:'Polos encontrados',value:fmt(poles.length)},{label:'Vínculos de origem',value:fmt(poles.reduce((n,p)=>n+p.associated.length,0))}];
      base.note='Relação de escolas de 2023. As seções publicadas não vêm acompanhadas da zona eleitoral. Eleitores relacionados não são votos apurados. O arquivo não contém votação por escola ou urna.';
      if(poles.some(p=>p.id===data.annulment.poleId))base.note+=' A urna 031 do polo 09 do Conselho II teve 348 votos anulados.';
      base.blocks=[{type:'table',title:'Escolas polo de votação no filtro',headers:['Conselho / polo','Escola','Endereço'],widths:[1.2,3,3.5],rows:poles.map(p=>['CT '+p.council+' / '+p.number,p.name,p.address])}];
      if(selection.associated)base.blocks.push({type:'table',title:'Escolas de origem e seções publicadas',headers:['Conselho / polo','Escola de origem','Seções'],widths:[1.2,3,3.5],rows:poles.flatMap(p=>p.associated.map(a=>['CT '+p.council+' / '+p.number,a.name,a.sections]))});
      base.finalResult={title:'Total da consulta de escolas',summary:fmt(poles.length)+' polos e '+fmt(poles.reduce((n,p)=>n+p.associated.length,0))+' vínculos de escolas de origem',detail:'Relação de 2023. Não representa quantidade de votos.'};
      return base;
    }
    const top=[...rows].sort((a,b)=>b.votes-a.votes).slice(0,kind==='summary'?5:10);
    base.blocks=[{type:'bars',title:'Maiores votações do filtro',rows:top.map(bar)},
      {type:'table',title:kind==='summary'?'Totais publicados por conselho':'Candidatos do filtro — todas as linhas',headers:kind==='summary'?['Conselho','Válidos','Comparecimento','Polos']:['Conselho','Candidato','Votos','% nominal','Posição','Situação'],widths:kind==='summary'?[2,1.3,1.8,1]:[0.8,3.2,1,1,0.7,1.4],rows:kind==='summary'?s.councils.map(c=>['CT '+c.id,fmt(c.reported.valid),fmt(c.reported.attendance),fmt(data.poles.filter(p=>p.council===c.id).length)]):rows.map(c=>['CT '+c.council,c.number+' '+c.name,fmt(c.votes),pct(c.share),c.rank+'º',statusLabel(c.status)])}];
    base.finalResult={title:'Resultado da seleção',summary:fmt(sum(rows,'votes'))+' votos nominais em '+fmt(rows.length)+' candidaturas',detail:'Soma dos candidatos do filtro. Total de válidos publicado no conselho: '+fmt(s.reported.valid)+'.'};
    if(kind==='summary'){base.layout='single-page-summary';base.summaryChart=base.blocks.shift();}
    return base;
  }
  const api={validate,scope,candidate,candidates,schools,compare,report,competition,sourceNote,normalize,statusLabel};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CouncilModel=api;
})(typeof window!=='undefined'?window:globalThis);
