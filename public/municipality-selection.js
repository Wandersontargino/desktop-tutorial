(function(root){
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const alpha=(a,b)=>a.name.localeCompare(b.name,'pt-BR');
  function codes(values,municipalities){
    if(!Array.isArray(values)||values.length>144)throw new Error('Selecione de 1 a 144 municípios.');
    const allowed=new Map(municipalities.map(m=>[String(m[0]),m]));
    const unique=[...new Set(values.map(String))];
    if(unique.some(code=>!allowed.has(code)))throw new Error('Há um município que não pertence à base ativa.');
    return unique.sort((a,b)=>String(allowed.get(a)[1]).localeCompare(String(allowed.get(b)[1]),'pt-BR'));
  }
  function data({city,candidate,index,municipality='',zone='',placeSearch='',place='',places:schoolSelection=[]}){
    if(city?.y!==2026||!['estadual','federal'].includes(city?.o)||!candidate)throw new Error('Selecione uma candidatura da base de 2026.');
    const selected=codes(city.municipalityCodes||[city.m[0]],index.municipalities);
    const names=new Map(index.municipalities.map(m=>[String(m[0]),String(m[1])]));
    const municipalities=new Map(selected.map(code=>[code,{code,name:names.get(code),totalVotes:0,votes:0,zones:[],places:[]}]));
    const votes=new Map(candidate[5]),zones=new Map(),places=new Map(),query=normalize(placeSearch);
    const selectedSchools=new Set(schoolSelection.length?schoolSelection:place?[place]:[]),schoolLabels=new Map();
    let totalVotes=0,filteredVotes=0;
    city.s.forEach((section,i)=>{
      const code=String(section[4]||city.m[0]),item=municipalities.get(code);
      if(!item)throw new Error('O resultado contém um município fora da seleção.');
      const value=Number(votes.get(i))||0,number=String(Number(section[0])),school=String(section[5]||section[2]||'Local não informado');
      item.totalVotes+=value;totalVotes+=value;
      const schoolKey=JSON.stringify([code,school]);
      if(selectedSchools.has(schoolKey))schoolLabels.set(schoolKey,school+' • '+item.name);
      if(municipality&&municipality!==code||zone&&zone!==code+'|'+number||query&&!normalize(school).includes(query)||selectedSchools.size&&!selectedSchools.has(schoolKey))return;
      item.votes+=value;filteredVotes+=value;
      const zoneKey=JSON.stringify([code,number]),placeKey=JSON.stringify([code,number,school]);
      if(!zones.has(zoneKey))zones.set(zoneKey,{municipalityCode:code,municipality:item.name,zone:number,votes:0});
      zones.get(zoneKey).votes+=value;
      if(!places.has(placeKey))places.set(placeKey,{municipalityCode:code,municipality:item.name,zone:number,name:school,votes:0});
      places.get(placeKey).votes+=value;
    });
    if(totalVotes!==Number(candidate[3]))throw new Error('O total dos municípios não corresponde aos votos da candidatura.');
    const orderedZones=[...zones.values()].sort((a,b)=>a.municipality.localeCompare(b.municipality,'pt-BR')||Number(a.zone)-Number(b.zone));
    const orderedPlaces=[...places.values()].sort((a,b)=>a.municipality.localeCompare(b.municipality,'pt-BR')||Number(a.zone)-Number(b.zone)||alpha(a,b));
    for(const item of orderedZones)municipalities.get(item.municipalityCode).zones.push(item);
    for(const item of orderedPlaces)municipalities.get(item.municipalityCode).places.push(item);
    return {municipalities:[...municipalities.values()].sort(alpha),zones:orderedZones,places:orderedPlaces,totalVotes,filteredVotes,
      filtered:!!(municipality||zone||query||selectedSchools.size),filters:{municipality,zone,placeSearch,place,places:[...selectedSchools],placeLabel:[...selectedSchools].map(key=>schoolLabels.get(key)||key+' (indisponível)').join('; ')}};
  }
  function report({result,candidate,office,ballotName,source,version,places=false}){
    const fmt=value=>new Intl.NumberFormat('pt-BR').format(value),zone=value=>String(value).padStart(3,'0');
    const municipalityRows=result.municipalities.map(m=>[m.name,fmt(m.totalVotes),...(result.filtered?[fmt(m.votes)]:[])]);
    const model={title:places?'Municípios selecionados — locais de votação':'Municípios selecionados — municípios e zonas',subtitle:candidate[1]+' — '+candidate[2],
      generatedAt:new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),compactIndicators:true,
      meta:[['Eleição','2026 • 1º turno • Pará'],['Cargo',office],['Nome de urna',ballotName||'Não disponível nesta consulta'],['Fonte ativa',source],['Versão da base',version],
        ['Municípios',result.municipalities.map(m=>m.name).join(', ')],['Município no filtro',result.municipalities.find(m=>m.code===result.filters.municipality)?.name||'Todos os selecionados'],['Zona',result.filters.zone?zone(result.filters.zone.split('|')[1])+' • '+result.municipalities.find(m=>m.code===result.filters.zone.split('|')[0])?.name:'Todas'],['Busca por escola',result.filters.placeSearch||'Todos os locais'],['Local / escola selecionado',result.filters.placeLabel||'Todos os locais']],
      indicators:[{label:'Municípios selecionados',value:fmt(result.municipalities.length)},{label:'Votos nos municípios',value:fmt(result.totalVotes)},...(result.filtered?[{label:'Votos no filtro',value:fmt(result.filteredVotes)}]:[])],
      blocks:[{type:'table',title:'Total de votos por município',compact:true,cellInset:24,headers:['Município','Votos no município',...(result.filtered?['Votos no filtro']:[])],rows:municipalityRows,widths:result.filtered?[3,1,1]:[4,1]},
        {type:'table',title:'Votos por município e zona',compact:true,cellInset:24,headers:['Município','Zona','Votos 2026'],rows:result.zones.map(z=>[z.municipality,zone(z.zone),fmt(z.votes)]),widths:[3,1,1]}],
      note:'Resultados da base ativa de 2026. A seleção é identificada por município; zonas e escolas são apresentadas em ordem alfabética e numérica. Os totais municipais incluem todos os votos da candidatura no município. Os filtros refinam o detalhamento.'};
    if(places)model.blocks.push({type:'table',title:'Votos por local de votação',compact:true,cellInset:24,headers:['Município','Zona','Local / escola','Votos 2026'],rows:result.places.map(p=>[p.municipality,zone(p.zone),p.name,fmt(p.votes)]),widths:[1.7,.7,4,1]});
    return model;
  }
  const api={codes,data,report};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MunicipalitySelection=api;
})(typeof window!=='undefined'?window:globalThis);
