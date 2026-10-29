(function(root){
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
  const integer=value=>new Intl.NumberFormat('pt-BR').format(value);
  const percent=value=>value==null?'—':value.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
  const voteChange=typeof module!=='undefined'&&module.exports?require('./election-scope.js').change:(current,previous)=>root.ElectoralScope.change(current,previous);
  const delta=(current,previous)=>previous==null?null:previous>0?(current-previous)/previous*100:null;
  const yearsForOffice=office=>office==='vereador'?[2024,2020]:['estadual','federal'].includes(office)?[2026,2022,2018,2014]:[];
  const officeName=office=>({vereador:'Vereador',estadual:'Deputado Estadual',federal:'Deputado Federal'})[office]||'';
  function validate(data,year,office){
    if(data?.schema!==1||data.electionYear!==year||data.uf!=='PA'||data.office!==office||data.turn!==1||data.denominator!=='nominal')throw new Error('A base não corresponde ao ano, cargo e turno selecionados.');
    if(!yearsForOffice(office).includes(year))throw new Error('Eleição não disponível.');
    if(data.municipalities.length!==144||data.regions.length!==13)throw new Error('Cobertura territorial incompleta.');
    const municipalities=new Set(data.municipalities.map(row=>String(row[0]))),regions=new Set(data.regions.map(row=>String(row[0])));
    if(municipalities.size!==144||regions.size!==13||data.municipalities.some(row=>!regions.has(String(row[2]))))throw new Error('Divisão territorial inválida.');
    const zones=new Map(),totals=new Map();
    for(const [municipality,zone,votes,sections] of data.zones){const key=municipality+'|'+zone;if(!municipalities.has(String(municipality))||zones.has(key)||!Number.isSafeInteger(votes)||votes<0||!Number.isSafeInteger(sections)||sections<1)throw new Error('Total territorial inválido.');zones.set(key,votes);}
    const ids=new Set();let all=0;
    for(const candidate of data.candidates){
      if(!candidate.id||ids.has(candidate.id)||!candidate.number||!candidate.fullName||!Number.isSafeInteger(candidate.votes)||candidate.votes<0)throw new Error('Candidatura inválida.');ids.add(candidate.id);
      if(office==='vereador'&&!municipalities.has(candidate.municipality))throw new Error('Município da candidatura inválido.');
      const seen=new Set();let sum=0;
      for(const [municipality,zone,votes] of candidate.rows){const key=municipality+'|'+zone;if((office==='vereador'&&String(municipality)!==candidate.municipality)||!zones.has(key)||seen.has(key)||!Number.isSafeInteger(votes)||votes<=0)throw new Error('Distribuição de candidato inválida.');seen.add(key);sum+=votes;totals.set(key,(totals.get(key)||0)+votes);}
      if(sum!==candidate.votes)throw new Error('Votos do candidato não conferem com as zonas.');all+=sum;
    }
    if(all!==data.totalVotes||[...zones].reduce((n,[key,votes])=>n+votes,0)!==all||[...zones].some(([key,votes])=>(totals.get(key)||0)!==votes))throw new Error('Somas da eleição divergentes.');
    return data;
  }
  function createCurrentSummary(index,statewide,regional,metadata,version){
    if(index.electionYear!==2026||statewide.electionYear!==2026||regional.currentElectionYear!==2026||metadata.electionYear!==2026||metadata.turn!==1||metadata.uf!=='PA'||index.office!==statewide.office||index.office!==regional.office||index.office!==metadata.office)throw new Error('Bases de 2026 incompatíveis.');
    const candidates=statewide.candidates.map(row=>{const identity=metadata.candidates[String(row[0])],match=identity&&identity.number===String(row[1])&&normalize(identity.fullName)===normalize(row[2]);return {id:String(row[0]),number:String(row[1]),fullName:row[2],ballotName:match?identity.ballotName:'',party:match?identity.party:null,federation:match?identity.federation:null,votes:row[3],rows:[]};});
    const byId=new Map(candidates.map(c=>[c.id,c])),zones=[],seenCities=new Set();
    function addCity(city){
      if(city.y!==2026||city.o!==index.office||seenCities.has(String(city.m[0])))throw new Error('Município de outra eleição ou duplicado.');seenCities.add(String(city.m[0]));
      const zoneTotals=new Map(),zoneSections=new Map();
      for(const section of city.s){const zone=String(section[0]);zoneTotals.set(zone,0);zoneSections.set(zone,(zoneSections.get(zone)||0)+1);}
      for(const candidate of city.c){const found=byId.get(String(candidate[0]));if(!found||found.number!==String(candidate[1])||normalize(found.fullName)!==normalize(candidate[2]))throw new Error('Identidade divergente na base ativa.');const distribution=new Map();let sum=0;
        for(const [sectionIndex,votes] of candidate[5]){const section=city.s[sectionIndex];if(!section||!Number.isSafeInteger(votes)||votes<=0)throw new Error('Seção ou votação inválida.');const zone=String(section[0]);sum+=votes;distribution.set(zone,(distribution.get(zone)||0)+votes);zoneTotals.set(zone,zoneTotals.get(zone)+votes);}
        if(sum!==candidate[3])throw new Error('Total municipal do candidato divergente.');
        for(const [zone,votes]of distribution)found.rows.push([String(city.m[0]),zone,votes]);
      }
      for(const [zone,votes]of zoneTotals)zones.push([String(city.m[0]),zone,votes,zoneSections.get(zone)]);
    }
    function finish(){const data={schema:1,electionYear:2026,uf:'PA',office:index.office,turn:1,denominator:'nominal',source:{title:index.source,url:'https://dadosabertos.tse.jus.br/dataset/resultados-2026',generation:index.source,version,candidateSource:metadata.source},regions:regional.regions,municipalities:regional.municipalities,totalVotes:statewide.totalVotes,zones,candidates};
    return validate(data,2026,index.office);}
    return {addCity,finish};
  }
  function fromCurrent(index,statewide,regional,cities,metadata,version){const summary=createCurrentSummary(index,statewide,regional,metadata,version);for(const city of cities)summary.addCity(city);return summary.finish();}
  function entities(data,mode,filters={}){
    const allowed=new Set(scopeMunicipalities(data,filters).map(row=>String(row[0])));
    const candidates=data.office==='vereador'?data.candidates.filter(c=>allowed.has(c.municipality)):data.candidates;
    if(mode==='candidate')return candidates.map(c=>({id:c.id,label:`${c.number} — ${c.ballotName||c.fullName}`,fullName:c.fullName,municipality:c.municipality,candidates:[c],votes:c.votes})).sort((a,b)=>b.votes-a.votes||a.label.localeCompare(b.label));
    const groups=new Map();
    for(const candidate of candidates){const info=mode==='party'?candidate.party:candidate.federation;if(!info)continue;const id=mode==='party'?info.number+'|'+info.sigla:info.id+'|'+info.name;if(!groups.has(id))groups.set(id,{id,label:mode==='party'?`${info.sigla} — ${info.name}`:(info.sigla?info.sigla+' — ':'')+info.name,candidates:[],votes:0});const group=groups.get(id);group.candidates.push(candidate);group.votes+=candidate.votes;}
    return [...groups.values()].sort((a,b)=>b.votes-a.votes||a.label.localeCompare(b.label));
  }
  function scopeMunicipalities(data,filters){return data.municipalities.filter(row=>(!filters.region||String(row[2])===filters.region)&&(!filters.municipality||String(row[0])===filters.municipality));}
  function aggregate(data,entity,filters={}){
    if(data.office==='vereador'&&entity.municipality){
      if(filters.municipality&&filters.municipality!==entity.municipality)throw new Error('O candidato pertence a outro município.');
      filters={...filters,municipality:entity.municipality};
    }
    const municipalities=scopeMunicipalities(data,filters),allowed=new Set(municipalities.map(row=>String(row[0]))),votes=new Map();
    for(const candidate of entity.candidates)for(const [municipality,zone,value]of candidate.rows)if(allowed.has(String(municipality))&&(!filters.zone||String(zone)===filters.zone)){const key=municipality+'|'+zone;votes.set(key,(votes.get(key)||0)+value);}
    const zones=data.zones.filter(row=>allowed.has(String(row[0]))&&(!filters.zone||String(row[1])===filters.zone)).map(([municipality,zone,denominator])=>({key:municipality+'|'+zone,municipality:String(municipality),zone:String(zone),name:(municipalities.find(row=>String(row[0])===String(municipality))||[])[1]+' • Zona '+String(zone).padStart(3,'0'),votes:votes.get(municipality+'|'+zone)||0,denominator}));
    const municipalRows=municipalities.map(([id,name,region])=>{const selected=zones.filter(row=>row.municipality===String(id));return {key:String(id),name,region,votes:selected.reduce((n,r)=>n+r.votes,0),denominator:selected.reduce((n,r)=>n+r.denominator,0)};});
    const regionRows=data.regions.filter(row=>!filters.region||String(row[0])===filters.region).map(([id,name])=>{const selected=municipalRows.filter(row=>String(row.region)===String(id));return {key:String(id),name,votes:selected.reduce((n,r)=>n+r.votes,0),denominator:selected.reduce((n,r)=>n+r.denominator,0)};}).filter(row=>municipalRows.some(m=>String(m.region)===row.key));
    const total=zones.reduce((n,r)=>n+r.votes,0),denominator=zones.reduce((n,r)=>n+r.denominator,0);
    const addShare=rows=>rows.map(row=>({...row,share:row.denominator>0?row.votes/row.denominator*100:null,concentration:total>0?row.votes/total*100:null})).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name));
    return {total,denominator,share:denominator>0?total/denominator*100:null,coverage:municipalRows.filter(row=>row.votes>0).length,municipalities:municipalities.length,zoneCoverage:zones.filter(row=>row.votes>0).length,zoneCount:zones.length,municipal:addShare(municipalRows),regional:addShare(regionRows),zones:addShare(zones)};
  }
  function matchPrevious(current,previous,candidate){
    if(!previous||current.office!==previous.office||current.turn!==previous.turn||previous.electionYear>=current.electionYear||current.uf!==previous.uf)return null;
    const key=normalize(candidate.fullName),sameScope=c=>normalize(c.fullName)===key&&(current.office!=='vereador'||c.municipality===candidate.municipality);if(current.candidates.filter(sameScope).length!==1)return null;
    const matches=previous.candidates.filter(sameScope);return matches.length===1?matches[0]:null;
  }
  function compare(data,entity,filters,previous){
    const current=aggregate(data,entity,filters),candidate=entity.candidates.length===1?entity.candidates[0]:null;
    const found=candidate?matchPrevious(data,previous,candidate):null;
    const prior=found?aggregate(previous,{candidates:[found],municipality:found.municipality},filters):null;
    // A missing zone is missing coverage, never an invented zero.
    const zoneCoverage=prior&&current.zones.every(row=>prior.zones.some(p=>p.key===row.key));
    const historical=prior&&(!filters.zone||zoneCoverage)?prior:null;
    const rows=kind=>current[kind].map(row=>{const old=historical?.[kind].find(p=>p.key===row.key),prior=old?.denominator>0?old.votes:null;return {...row,previous:prior,previousShare:old?.share??null,change:delta(row.votes,prior),difference:voteChange(row.votes,prior).difference};});
    return {...current,municipal:rows('municipal'),regional:rows('regional'),zones:rows('zones'),previousZones:historical?.zones||[],previous:historical?.total??null,previousShare:historical?.share??null,change:delta(current.total,historical?.total),difference:voteChange(current.total,historical?.total).difference,matched:found,comparisonAvailable:!!historical,previousYear:previous?.electionYear??null};
  }
  function distributionColors(data,result,local){
    const palette=['#1262ae','#27a39a','#53ad62','#e2a13b','#7864b6','#278ba0','#ca5f6f','#8d9d45','#d77b43','#697b91','#cf7dbe','#708cdd','#32a59b'];
    const keys=local?[...new Set([...result.zones,...result.previousZones].map(row=>row.key))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})):data.regions.map(row=>String(row[0]));
    return new Map(keys.map((key,i)=>[key,palette[i%palette.length]]));
  }
  function summary(data,entity,result,filters){
    const city=data.municipalities.find(row=>String(row[0])===(entity.municipality||filters.municipality)),region=data.regions.find(row=>String(row[0])===filters.region);
    const scope=[city?.[1]||region?.[1]||'todos os municípios do Pará',filters.zone?'zona '+filters.zone.padStart(3,'0'):''].filter(Boolean).join(' • ');
    let text=`Em ${data.electionYear}, ${entity.label} recebeu ${integer(result.total)} votos nominais em ${scope}, equivalentes a ${percent(result.share)} dos votos nominais do cargo nesse recorte. Houve votos em ${integer(result.coverage)} de ${integer(result.municipalities)} municípios do recorte.`;
    if(data.office==='vereador'&&entity.municipality)text=text.replace(`Houve votos em ${integer(result.coverage)} de ${integer(result.municipalities)} municípios do recorte.`,`Houve votos em ${integer(result.zoneCoverage)} de ${integer(result.zoneCount)} zonas do município no recorte.`);
    if(result.comparisonAvailable){text+=` Na eleição de ${result.previousYear}, a candidatura correspondente recebeu ${integer(result.previous)} votos nesse recorte. Variação: ${voteChange(result.total,result.previous).label}.`;}
    return text;
  }
  function report(data,entity,result,filters,mode,kind='complete'){
    const historical=result.comparisonAvailable,years=[data.electionYear,historical?result.previousYear:null];
    const table=(title,rows)=>({type:'table',title,compact:true,headers:['Território',`Votos ${years[0]}`,'% nominal',...(historical?[`Votos ${years[1]}`,'Diferença: votos e %']:[])],widths:historical?[3.6,1.2,1.1,1.2,2]:[4,1.4,1.3],rows:rows.map(row=>[row.name,integer(row.votes),percent(row.share),...(historical?[row.previous==null?'—':integer(row.previous),voteChange(row.votes,row.previous).label]:[])])});
    const local=data.office==='vereador'&&!!entity.municipality,distribution=local?result.zones:result.regional,colors=distributionColors(data,result,local);
    const top=(local?result.zones:result.municipal).slice(0,10);
    const blocks=[{type:'bars',title:local?'Zonas — votação no município':'Municípios — maiores votações no recorte',rows:top.map(row=>({label:row.name,values:[{label:String(years[0]),value:row.votes,color:'#1262ae'},...(historical&&row.previous!=null?[{label:String(years[1]),value:row.previous,color:'#8a9eb8'}]:[])],change:row.previous==null?'':voteChange(row.votes,row.previous).label}))}];
    if(kind==='complete')blocks.push({type:'pie',title:(local?'Distribuição por zona • ':'Distribuição regional • ')+data.electionYear,rows:distribution.map(row=>({label:row.name,value:row.votes,color:colors.get(row.key)}))},...(historical?[{type:'pie',title:(local?'Distribuição por zona • ':'Distribuição regional • ')+result.previousYear,rows:(local?result.previousZones:distribution).map(row=>({label:row.name,value:local?row.votes:row.previous||0,color:colors.get(row.key)}))}]:[]),...(!local?[table('Regiões do recorte',result.regional),table('Todos os municípios do recorte',result.municipal)]:[]),table('Municípios e zonas do recorte',result.zones));
    return {electionYear:data.electionYear,turn:1,title:kind==='complete'?'Relatório eleitoral compacto':'Resumo da consulta eleitoral',subtitle:entity.label,generatedAt:new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),compactIndicators:true,indicatorColumns:historical?4:3,
      meta:[['Eleição',data.electionYear+' • Pará • 1º turno'],['Cargo',officeName(data.office)],['Consulta',mode==='candidate'?'Candidato':mode==='party'?'Partido — votos nominais':'Federação — votos nominais'],['Região',data.regions.find(row=>String(row[0])===(filters.region||(local?result.municipal[0]?.region:null)))?.[1]||'Todas as 13 regiões'],['Município',data.municipalities.find(row=>String(row[0])===(entity.municipality||filters.municipality))?.[1]||'Todos os municípios do recorte'],['Zona',filters.zone||'Todas'],['Fonte',data.source.title],['Geração da base',data.source.generation||'Consulte a fonte'],['Comparação',historical?`${data.electionYear} × ${result.previousYear} — correspondência única pelo nome completo, mesmo cargo${local?' e município':''}`:'Sem comparação histórica nesta consulta']],
      indicators:[{label:'Votos nominais',value:integer(result.total)},{label:'Participação nominal',value:percent(result.share)},{label:local?'Zonas com votos':'Municípios com votos',value:local?integer(result.zoneCoverage)+' / '+integer(result.zoneCount):integer(result.coverage)+' / '+integer(result.municipalities)},...(historical?[{label:`Variação ${result.previousYear} → ${data.electionYear}`,value:voteChange(result.total,result.previous).label,color:result.difference>0?'#208a5b':result.difference<0?'#bc3030':'#54677d'}]:[])],note:summary(data,entity,result,filters)+' Agregação regional usa a divisão territorial de 13 regiões configurada na plataforma. Votos de legenda não estão incluídos. Comparação por zona usa o mesmo código dentro do município; limites e eleitorado podem mudar entre eleições.',blocks};
  }
  const api={normalize,yearsForOffice,officeName,validate,createCurrentSummary,fromCurrent,entities,scopeMunicipalities,aggregate,matchPrevious,compare,distributionColors,summary,report,delta,voteChange};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ElectionArchiveModel=api;
})(typeof window!=='undefined'?window:globalThis);
