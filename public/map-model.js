(function(root){
  'use strict';
  const scope=typeof module!=='undefined'&&module.exports?require('./election-scope.js'):root.ElectoralScope;
  const pairs=values=>new Map((values||[]).map(([id,n])=>[String(id),Number(n)||0]));
  const share=(votes,total)=>total>0?votes/total*100:null;
  function build({index,statewide,regional,candidateIds,region='',metric='share',mode='heat',focusId=''}){
    if(index.electionYear!==2026&&index.year!==2026&&index.y!==2026)throw new Error('Base eleitoral do mapa incompatível.');
    if(index.office!==regional.office||statewide.office!==index.office)throw new Error('Bases de cargos diferentes no mapa.');
    if(regional.currentElectionYear!==2026||regional.previousElectionYear!==2022)throw new Error('Anos do resumo regional incompatíveis.');
    const ids=[...new Set(candidateIds.filter(Boolean).map(String))].slice(0,3);
    const candidates=ids.map(id=>statewide.candidates.find(c=>String(c[0])===id)).filter(Boolean);
    const current=candidates.map(c=>pairs(c[6])),prior=candidates.map(c=>scope.previousCandidate(c,regional.previousCandidates,statewide.candidates)),previous=prior.map(c=>pairs(c?.[6]));
    const previousTotals=pairs(regional.totals.previousMunicipalities),regions=new Map(regional.municipalities.map(m=>[String(m[0]),String(m[2])]));
    const rows=index.municipalities.filter(m=>!region||regions.get(String(m[0]))===region).map(m=>{
      const code=String(m[0]),total=Number(m[5])||0,prevTotal=previousTotals.get(code)||0;
      const values=candidates.map((c,i)=>{const votes=current[i].get(code)||0,previousVotes=prior[i]?(previous[i].get(code)||0):null,currentShare=share(votes,total),previousShare=previousVotes===null?null:share(previousVotes,prevTotal);return {id:String(c[0]),votes,share:currentShare,previousVotes,previousShare,delta:currentShare===null||previousShare===null?null:currentShare-previousShare,change:scope.change(votes,previousVotes)};});
      const positive=Math.max(0,...values.map(v=>v.votes)),leaders=positive>0?values.map((v,i)=>v.votes===positive?i:-1).filter(i=>i>=0):[];
      return {code,name:m[1],total,previousTotal:prevTotal,region:regions.get(code),values,winner:leaders.length===1?leaders[0]:null,tie:leaders.length>1};
    });
    const focus=Math.max(0,candidates.findIndex(c=>String(c[0])===String(focusId)));
    const values=rows.flatMap(r=>(mode==='compare'?r.values:[r.values[focus]]).flatMap(v=>[v?.[metric==='votes'?'votes':'share'],v?.[metric==='votes'?'previousVotes':'previousShare']])).filter(v=>v!==null&&v!==undefined);
    return {rows,candidates,prior,region,metric,mode,focus,max:Math.max(0,...values),deltaMax:Math.max(0,...rows.map(r=>Math.abs(r.values[focus]?.delta||0))),currentYear:2026,previousYear:2022};
  }
  function buildZones({city,candidates,prior,histories=[],zoneTotals=null,office,code}){
    if(city?.y!==2026||city.o!==office||String(city.m?.[0])!==String(code))throw new Error('Base de zonas incompatível.');
    const totals=new Map(),votes=candidates.map(()=>new Map());
    city.s.forEach(s=>totals.set(String(s[0]),0));
    for(const c of city.c)for(const [section,n]of c[5]){const z=String(city.s[section][0]);totals.set(z,(totals.get(z)||0)+n);}
    candidates.forEach((c,i)=>{const row=city.c.find(v=>String(v[0])===String(c[0]));for(const [section,n]of row?.[5]||[]){const z=String(city.s[section][0]);votes[i].set(z,(votes[i].get(z)||0)+n);}});
    const old=histories.map((h,i)=>{if(!h)return null;if(h.year!==2022||h.office!==office||!prior[i]||String(h.candidateId)!==String(prior[i][0]))throw new Error('Histórico de zonas incompatível.');const map=new Map();for(const [municipality,z,,,n]of h.rows){if(String(municipality)===String(code))map.set(String(Number(z)),(map.get(String(Number(z)))||0)+n);}return map;});
    if(zoneTotals&&(zoneTotals.year!==2022||zoneTotals.office!==office||zoneTotals.turn!==1||zoneTotals.denominator!=='nominal'))throw new Error('Totais históricos de zonas incompatíveis.');
    const historicalTotals=new Map((zoneTotals?.zones||[]).filter(r=>String(r[0])===String(code)).map(r=>[String(Number(r[1])),Number(r[2])]));
    const rows=[...totals].sort((a,b)=>Number(a[0])-Number(b[0])).map(([zone,total])=>{const previousTotal=historicalTotals.get(zone)||0,values=candidates.map((c,i)=>{const n=votes[i].get(zone)||0,previousVotes=old[i]&&(old[i].has(zone)||previousTotal>0)?old[i].get(zone)||0:null,currentShare=share(n,total),previousShare=previousVotes===null?null:share(previousVotes,previousTotal);return {id:String(c[0]),votes:n,share:currentShare,previousVotes,previousShare,delta:currentShare===null||previousShare===null?null:currentShare-previousShare,change:scope.change(n,previousVotes)};});const max=Math.max(0,...values.map(v=>v.votes)),leaders=max>0?values.map((v,i)=>v.votes===max?i:-1).filter(i=>i>=0):[];return {zone,total,previousTotal,values,winner:leaders.length===1?leaders[0]:null,tie:leaders.length>1};});
    return {code:String(code),name:city.m[1],rows,max:Math.max(0,...rows.flatMap(r=>r.values.map(v=>v.share||0)))};
  }
  function deltaColor(value,max){if(value===null||value===undefined)return '#e2e8f0';if(Math.abs(value)<1e-10)return '#f1f5f9';return blend(value>0?'#13864b':'#c73535',Math.abs(value),max);}
  function blend(hex,value,max){if(value===null||value===undefined)return '#e2e8f0';if(value<=0)return '#f1f5f9';const weight=.2+.8*Math.min(1,value/(max||1)),rgb=hex.replace('#','').match(/../g).map(x=>Math.round(255+(parseInt(x,16)-255)*weight));return '#'+rgb.map(x=>x.toString(16).padStart(2,'0')).join('');}
  function project(geometry){const transform=([lon,lat])=>[lon*Math.PI/180, -Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];return polygons.map(p=>p.map(r=>r.map(transform)));}
  function bounds(polygons){const points=polygons.flat(2);return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];}
  const api={build,buildZones,blend,deltaColor,project,bounds};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ElectoralMapModel=api;
})(typeof window!=='undefined'?window:globalThis);
