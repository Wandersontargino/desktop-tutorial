(function(root){
  'use strict';
  const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
  function reconstruct({catalog,history,currentCity,currentRoster,candidateId,historicalCandidateId,office}){
    if(catalog?.schema!==1||catalog.historicalYear!==2022||catalog.targetZone!=='107'||catalog.cityCode!=='4154')throw new Error('Catálogo territorial incompatível.');
    if(history?.year!==2022||history.office!==office||String(history.candidateId)!==String(historicalCandidateId)||!Array.isArray(history.rows))throw new Error('Histórico do candidato não confirmado para 2022.');
    if(currentCity?.y!==2026||currentCity.o!==office||String(currentCity.m?.[0])!==catalog.cityCode)throw new Error('Município, eleição ou cargo divergente.');
    let candidate=currentCity.c.find(c=>String(c[0])===String(candidateId));
    if(!candidate){
      if(currentRoster?.electionYear!==2026||currentRoster.office!==office||!currentRoster.candidates?.some(c=>String(c[0])===String(candidateId)))throw new Error('Candidato ausente da versão de 2026 consultada.');
      candidate=[String(candidateId),'','',0,0,[]];
    }
    const votes=new Map(candidate[5].map(([i,n])=>[i,n])),currentPlaces=new Map(),seen=new Set(),seenCurrent=new Set();
    currentCity.s.forEach((section,i)=>{
      if(String(Number(section[0]))!=='107')return;
      const key=normalize(section[2]);
      if(!currentPlaces.has(key))currentPlaces.set(key,{name:section[2],votes:0,sections:0});
      const place=currentPlaces.get(key);place.votes+=votes.get(i)||0;place.sections++;
    });
    const rows=catalog.locations.map(location=>{
      const origins=location.origins2022||[],names=new Set([location.name,...(location.aliases||[]),...origins.map(r=>r.place)].map(normalize));
      const current=[...currentPlaces.entries()].filter(([name])=>names.has(name));
      const old=location.status==='mapped'&&origins.length===1?origins[0]:null;
      if(old&&!['43','72'].includes(String(old.zone)))throw new Error('Origem fora das zonas 43 e 72.');
      const oldKey=old?String(old.zone)+'|'+normalize(old.place):'';
      if(old&&seen.has(oldKey))throw new Error('Um local de 2022 foi atribuído duas vezes.');
      if(old)seen.add(oldKey);
      let historicalVotes=null;
      if(old){
        const sections=new Set(old.sections.map(String));historicalVotes=0;
        for(const r of history.rows){
          if(String(r[0])!==catalog.cityCode||String(Number(r[1]))!==String(old.zone)||normalize(r[3])!==normalize(old.place))continue;
          if(!sections.has(String(Number(r[2])))||!Number.isSafeInteger(r[4])||r[4]<0)throw new Error('Seção ou votação histórica fora da correspondência conferida.');
          historicalVotes+=r[4];
        }
      }
      const currentPlace=current.length===1?current[0][1]:null,comparable=!!old&&!!currentPlace;
      if(comparable&&seenCurrent.has(normalize(currentPlace.name)))throw new Error('Um local atual foi associado a mais de uma correspondência histórica.');
      if(comparable)seenCurrent.add(normalize(currentPlace.name));
      const delta=comparable?currentPlace.votes-historicalVotes:null;
      return {...location,origin:old?.zone||'',historicalVotes,currentVotes:currentPlace?.votes??null,currentName:currentPlace?.name||'',currentSections:currentPlace?.sections||0,comparable,delta,percent:delta!==null&&historicalVotes>0?delta/historicalVotes:null,status:comparable?'comparable':old?'2022-only':currentPlace?'2026-only':'unresolved'};
    });
    const comparable=rows.filter(r=>r.comparable),sum=(items,key)=>items.reduce((n,r)=>n+(r[key]||0),0);
    const previous=sum(comparable,'historicalVotes'),current=sum(comparable,'currentVotes'),delta=current-previous;
    return {office,candidateId:String(candidateId),historicalCandidateId:String(historicalCandidateId),catalog,rows,comparable:comparable.length,planned:catalog.locations.length,mapped:rows.filter(r=>r.historicalVotes!==null).length,previous,current,delta:comparable.length?delta:null,percent:comparable.length&&previous>0?delta/previous:null,reconstructed2022:sum(rows,'historicalVotes'),fullZone2026:[...currentPlaces.values()].reduce((n,r)=>n+r.votes,0),origins:['43','72'].map(zone=>({zone,locations:rows.filter(r=>r.origin===zone).length,votes:sum(rows.filter(r=>r.origin===zone),'historicalVotes')})),historicalSource:history.source||'TSE — votação por seção, 2022'};
  }
  const api={normalize,reconstruct};if(typeof module==='object'&&module.exports)module.exports=api;else root.ZoneHistoryModel=api;
})(typeof window==='object'?window:globalThis);
