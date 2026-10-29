(function(root){
  'use strict';
  const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
  const number=v=>/^\d+$/.test(String(v))&&Number(v)>0?String(Number(v)):'';
  function validateLocations(data){
    if(data?.year!==2026||data.turn!==1||!data.locations||typeof data.locations!=='object'||Array.isArray(data.locations))throw new Error('A fonte de locais deve ser do Pará, ano 2026 e 1º turno.');
    return data;
  }
  function findLocation(data,{municipality='',zone,section}){
    validateLocations(data);const z=number(zone),s=number(section),m=number(municipality);
    if(!z||+z>999||!s||+s>9999)throw new Error('Informe zona e seção válidas.');
    const seen=new Set(),matches=[];
    for(const row of data.locations[z+'|'+s]||[]){
      if(m&&number(row.cityCode)!==m)continue;
      if(!number(row.cityCode)||!row.city||!normalize(row.place)||/^LOCAL NAO (INFORMADO|CONFIRMADO)$/.test(normalize(row.place)))continue;
      const key=JSON.stringify([number(row.cityCode),normalize(row.place),normalize(row.neighborhood)]);
      if(!seen.has(key)){seen.add(key);matches.push({...row,zone:z,section:s});}
    }
    return {matches,status:matches.length===1?'confirmed':matches.length?'ambiguous':'missing',year:2026,generation:data.generation};
  }
  function auditLocations(data){
    validateLocations(data);let total=0,conflicts=0,missingNeighborhood=0;const municipalities=new Set();
    for(const [key,rows]of Object.entries(data.locations)){
      if(!Array.isArray(rows)||!/^\d+\|\d+$/.test(key))throw new Error('Índice de locais inválido.');
      const byCity=new Map();for(const row of rows){
        total++;municipalities.add(number(row.cityCode));if(!normalize(row.neighborhood))missingNeighborhood++;
        const city=number(row.cityCode),identity=JSON.stringify([normalize(row.place),normalize(row.neighborhood)]);
        if(!byCity.has(city))byCity.set(city,new Set());byCity.get(city).add(identity);
      }
      conflicts+=[...byCity.values()].filter(s=>s.size>1).length;
    }
    municipalities.delete('');return {total,sections:Object.keys(data.locations).length,municipalities:municipalities.size,conflicts,missingNeighborhood,generation:data.generation};
  }
  function profile(data,municipalities,zone=''){
    if(data?.schema!==1||data.electionYear!==2026||data.uf!=='PA'||!Array.isArray(data.rows))throw new Error('Perfil do eleitorado incompatível.');
    const allowed=new Set(municipalities.map(String)),groups={gender:new Map(),age:new Map(),education:new Map()};let total=0,zones=0;
    for(const row of data.rows){if(!allowed.has(String(row.municipality))||zone&&String(row.zone)!==String(zone))continue;
      if(!Number.isSafeInteger(row.total)||row.total<0)throw new Error('Total inválido no perfil.');total+=row.total;zones++;
      for(const dimension of Object.keys(groups)){
        const entries=Object.entries(row[dimension]||{});if(entries.reduce((s,[,v])=>s+v,0)!==row.total||entries.some(([,v])=>!Number.isSafeInteger(v)||v<0))throw new Error('As dimensões do perfil não conferem.');
        for(const [label,value]of entries)groups[dimension].set(label,(groups[dimension].get(label)||0)+value);
      }
    }
    return {total,zones,groups:Object.fromEntries(Object.entries(groups).map(([key,map])=>[key,[...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR')).map(([label,value])=>({label,value,share:total?100*value/total:null}))]))};
  }
  const api={normalize,findLocation,auditLocations,profile,validateLocations};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TseModel=api;
})(typeof window!=='undefined'?window:globalThis);
