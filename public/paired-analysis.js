(function(root){
  'use strict';
  const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const number=v=>String(Number(v));
  const sectionKey=(code,zone,section)=>JSON.stringify([String(code),number(zone),number(section)]);
  const placeVerified=r=>!r.locationConflict&&!!normalize(r.place)&&!['local nao informado','local nao confirmado'].includes(normalize(r.place));
  // Unverified locations remain separate by section instead of forming a fictitious school.
  const placeKey=r=>placeVerified(r)?JSON.stringify([r.code,normalize(r.place),normalize(r.neighborhood)]):JSON.stringify([r.code,'unverified',r.zone,r.section]);
  const neighborhoodKey=r=>JSON.stringify([r.code,normalize(r.neighborhood)]);
  function project(city,id,office){
    if(city.y!==2026||city.o!==office)throw new Error('Os dois cargos precisam usar dados de 2026.');
    const totals=new Float64Array(city.s.length), votes=new Map();
    city.c.forEach(c=>c[5].forEach(([i,v])=>{if(!city.s[i]||!Number.isSafeInteger(v)||v<0)throw new Error('Votação por seção inválida.');totals[i]+=v;if(String(c[0])===String(id))votes.set(i,v);}));
    const seen=new Set();
    return city.s.map((s,i)=>{
      const key=sectionKey(city.m[0],s[0],s[1]);if(seen.has(key))throw new Error('Seção duplicada na base.');seen.add(key);
      return {key,code:String(city.m[0]),city:city.m[1],zone:number(s[0]),section:number(s[1]),place:s[2]||'Local não informado',neighborhood:s[3]||'Bairro não informado',votes:votes.get(i)||0,total:totals[i]};
    });
  }
  function join(e,f){
    const out=new Map();
    for(const [office,rows] of [['e',e],['f',f]])for(const r of rows){
      if(!out.has(r.key))out.set(r.key,{...r,e:null,f:null,te:null,tf:null,locationConflict:false});
      const row=out.get(r.key);
      if(row[office]!==null)throw new Error('Seção repetida no comparativo.');
      row[office]=r.votes;row['t'+office]=r.total;
      if(normalize(row.place)!==normalize(r.place)||normalize(row.neighborhood)!==normalize(r.neighborhood)){
        row.locationConflict=true;row.place='Local divergente entre os cargos';row.neighborhood='Bairro divergente entre os cargos';
      }
    }
    return [...out.values()];
  }
  function metrics(rows){
    const e=rows.reduce((s,r)=>s+(r.e??0),0),f=rows.reduce((s,r)=>s+(r.f??0),0);
    const te=rows.reduce((s,r)=>s+(r.te??0),0),tf=rows.reduce((s,r)=>s+(r.tf??0),0);
    const missing=rows.filter(r=>r.e===null||r.f===null).length;
    const complete=rows.length>0&&!missing;
    const upper=complete?rows.reduce((s,r)=>s+Math.min(r.e,r.f),0):null;
    const similarity=complete&&rows.length>=2&&e>0&&f>0?Math.max(0,Math.min(1,rows.reduce((s,r)=>s+Math.min(r.e/e,r.f/f),0))):null;
    return {e,f,te,tf,shareE:te?e/te:null,shareF:tf?f/tf:null,missing,upper,similarity,sections:rows.length,commonPositive:rows.filter(r=>r.e>0&&r.f>0).length};
  }
  function groupKey(r,unit){
    if(unit==='zone')return JSON.stringify([r.code,r.zone]);
    if(unit==='section')return r.key;
    if(unit==='place')return placeKey(r);
    if(unit==='neighborhood')return neighborhoodKey(r);
    return r.code;
  }
  function label(r,unit){
    if(unit==='zone')return `${r.city} • Zona ${String(r.zone).padStart(3,'0')}`;
    if(unit==='section')return `${r.city} • Zona ${String(r.zone).padStart(3,'0')} / Seção ${String(r.section).padStart(4,'0')}`;
    if(unit==='place')return `${r.place} • ${r.city} • ${placeVerified(r)?r.neighborhood:'Z'+r.zone+' / S'+r.section}`;
    if(unit==='neighborhood')return `${r.neighborhood} • ${r.city}`;
    return r.city;
  }
  function group(rows,unit){
    const groups=new Map();
    rows.forEach(r=>{const key=groupKey(r,unit);if(!groups.has(key))groups.set(key,{key,label:label(r,unit),rows:[]});groups.get(key).rows.push(r);});
    return [...groups.values()].map(g=>{const m=metrics(g.rows);return {...g,...m,e:g.rows.every(r=>r.e!==null)?m.e:null,f:g.rows.every(r=>r.f!==null)?m.f:null};}).sort((a,b)=>(b.e??0)+(b.f??0)-(a.e??0)-(a.f??0)||a.label.localeCompare(b.label,'pt-BR'));
  }
  function counts(rows){
    const m=metrics(rows),complete=rows.length>0&&!m.missing,max=Math.max(m.e,m.f);
    const gap=complete?Math.abs(m.e-m.f):null;
    const sectionGap=complete?rows.reduce((sum,r)=>sum+Math.abs(r.e-r.f),0):null;
    return {gap,gapRatio:complete&&max>0?gap/max:null,proximity:complete&&max>0?1-gap/max:null,
      upper:m.upper,alignment:complete&&max>0?m.upper/max:null,sectionGap,
      compatibleShareE:complete&&m.e>0?m.upper/m.e:null,compatibleShareF:complete&&m.f>0?m.upper/m.f:null,
      aboveLimitE:complete?m.e-m.upper:null,aboveLimitF:complete?m.f-m.upper:null,
      equalPositive:rows.filter(r=>r.e>0&&r.e===r.f).length,
      active:rows.filter(r=>r.e>0||r.f>0).length,
      locationVerified:rows.every(placeVerified)};
  }
  function assess(g,tolerance=.1,school=false){
    if(g.e===null||g.f===null||g.missing)return {key:'missing',label:'Sem cobertura completa',tone:'muted'};
    if(school&&!g.locationVerified)return {key:'location',label:'Local a conferir',tone:'attention'};
    if(!g.e&&!g.f)return {key:'zero',label:'Sem votos para a dupla',tone:'muted'};
    if(!g.gap)return school&&g.sectionGap>0?{key:'offset',label:'Totais iguais; seções diferentes',tone:'attention'}:{key:'equal',label:school?'Totais e seções iguais':'Totais iguais',tone:'equal'};
    return g.gapRatio<=tolerance+1e-12?{key:'near',label:'Dentro da tolerância',tone:'near'}:{key:'different',label:'Acima da tolerância',tone:'attention'};
  }
  function select(groups,criterion='voted',order='votes',tolerance=.1){
    const selected=groups.filter(g=>criterion==='all'||(criterion==='voted'&&(g.e>0||g.f>0))||
      (criterion==='equal'&&g.e>0&&g.gap===0)||
      (criterion==='near'&&g.gapRatio!==null&&g.gapRatio<=tolerance+1e-12)||
      (criterion==='different'&&g.gapRatio!==null&&g.gapRatio>tolerance+1e-12)||
      (criterion==='missing'&&g.missing));
    const volume=g=>(g.e??0)+(g.f??0);
    return selected.sort((a,b)=>{
      const primary=order==='gap'?(b.gap??-1)-(a.gap??-1):order==='closest'?(b.proximity??-1)-(a.proximity??-1):0;
      return primary||volume(b)-volume(a)||a.label.localeCompare(b.label,'pt-BR',{numeric:true});
    });
  }
  function correlation(rows,basis='votes'){
    const points=[];let missing=0,zero=0,noDenominator=0;
    for(const r of rows){
      if(!Number.isFinite(r.e)||!Number.isFinite(r.f)||r.e<0||r.f<0){missing++;continue;}
      if(!r.e&&!r.f){zero++;continue;}
      if(basis==='share'&&(!(r.te>0)||!(r.tf>0)||!Number.isFinite(r.te)||!Number.isFinite(r.tf))){noDenominator++;continue;}
      points.push({key:r.key,label:label(r,'section'),x:basis==='share'?100*r.e/r.te:r.e,y:basis==='share'?100*r.f/r.tf:r.f});
    }
    const result={basis,n:points.length,total:rows.length,missing,zero,noDenominator,points,r:null,slope:null,intercept:null,reason:''};
    if(points.length<3){result.reason='Exige pelo menos 3 seções válidas com votos para um ou ambos.';return result;}
    const mx=points.reduce((sum,p)=>sum+p.x,0)/points.length,my=points.reduce((sum,p)=>sum+p.y,0)/points.length;
    let xx=0,yy=0,xy=0;
    for(const p of points){const x=p.x-mx,y=p.y-my;xx+=x*x;yy+=y*y;xy+=x*y;}
    if(!xx||!yy){result.reason='Sem variação na votação de '+(!xx&&!yy?'ambos os candidatos':!xx?'estadual':'federal')+' entre as seções.';return result;}
    const r=Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy)));
    result.r=Math.abs(r)<1e-14?0:r;result.slope=xy/xx;result.intercept=my-result.slope*mx;
    return result;
  }
  // Aggregate only the drawing, retaining all observations in the coefficient.
  function scatter(points,maxX,maxY){
    const bins=new Map();
    for(const p of points){
      const key=Math.min(39,Math.floor(40*p.x/maxX))+','+Math.min(31,Math.floor(32*p.y/maxY));
      if(!bins.has(key))bins.set(key,{x:0,y:0,count:0,minX:p.x,maxX:p.x,minY:p.y,maxY:p.y});
      const b=bins.get(key);b.x+=p.x;b.y+=p.y;b.count++;b.minX=Math.min(b.minX,p.x);b.maxX=Math.max(b.maxX,p.x);b.minY=Math.min(b.minY,p.y);b.maxY=Math.max(b.maxY,p.y);
    }
    return [...bins.values()].map(b=>({...b,x:b.x/b.count,y:b.y/b.count}));
  }
  // Aggregate capacity in the same physical sections. No voter attribution or
  // allocation of shared votes is made. Missing coverage is never a zero vote.
  function registryUtilization(rows,fields=['e','f']){
    if(!fields.length||fields.some(field=>!['e','f'].includes(field)))throw Error('Escolha os cargos da consulta.');
    if(rows.some(r=>!Number.isSafeInteger(r.registered)||r.registered<0))throw Error('Quantidade de cadastros inválida para a seção.');
    const registered=rows.reduce((n,r)=>n+r.registered,0);
    const covered=rows.filter(r=>!r.locationConflict&&fields.every(field=>Number.isSafeInteger(r[field])&&r[field]>=0));
    const evaluated=covered.reduce((n,r)=>n+r.registered,0),partialUpper=covered.reduce((n,r)=>n+Math.min(r.registered,...fields.map(field=>r[field])),0);
    const complete=registered>0&&covered.length===rows.length,upper=complete?partialUpper:null,deficit=complete?registered-upper:null;
    return {registered,evaluated,uncovered:registered-evaluated,sections:rows.length,coveredSections:covered.length,missingSections:rows.length-covered.length,coverage:registered?evaluated/registered:null,complete,upper,ratio:upper===null?null:upper/registered,deficit,deficitRatio:deficit===null?null:deficit/registered,partialUpper,partialDeficit:evaluated-partialUpper};
  }
  const api={normalize,sectionKey,placeKey,placeVerified,neighborhoodKey,project,join,metrics,counts,assess,select,correlation,scatter,groupKey,label,group,registryUtilization};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PairedAnalysis=api;
})(typeof window!=='undefined'?window:globalThis);
