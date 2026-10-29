(function(root){
  'use strict';
  const cache=new Map(),pending=new Map();
  const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  function validate(data,office){
    if(!['estadual','federal'].includes(office)||data?.electionYear!==2026||data.uf!=='PA'||data.office!==office||data.turn!==1||data.source?.field!=='NM_URNA_CANDIDATO'||!data.candidates||Array.isArray(data.candidates))throw new Error('Base de nomes de urna incompatível.');
    for(const [id,r] of Object.entries(data.candidates))if(!/^\d{1,20}$/.test(id)||!r||!/^\d{4,5}$/.test(r.number)||![r.fullName,r.ballotName].every(n=>typeof n==='string'&&n.trim()&&n.length<=200))throw new Error('Identificação de candidatura inválida.');
    return data;
  }
  function lookup(data,candidate,office){
    if(!candidate||data?.electionYear!==2026||data.uf!=='PA'||data.office!==office||data.turn!==1||data.source?.field!=='NM_URNA_CANDIDATO')return null;
    const r=data.candidates?.[String(candidate[0])];
    return r&&String(r.number)===String(candidate[1])&&normalize(r.fullName)===normalize(candidate[2])?r:null;
  }
  async function load(office){
    if(cache.has(office))return cache.get(office);
    if(!pending.has(office))pending.set(office,(async()=>{
      const path=root.PlatformTools?.dataURL?.('candidate-names-2026.json',office)||`/api/election/${office}/data/candidate-names-2026.json?version=bundled`;
      const response=await fetch(path,{credentials:'same-origin',cache:'no-cache',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('Nomes de urna indisponíveis nesta consulta.');
      const data=validate(await response.json(),office);cache.set(office,data);return data;
    })().finally(()=>pending.delete(office)));
    return pending.get(office);
  }
  const record=(candidate,office)=>lookup(cache.get(office),candidate,office);
  const ballot=(candidate,office)=>record(candidate,office)?.ballotName||'';
  const api={load,validate,lookup,record,ballot,source:office=>cache.get(office)?.source||null};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CandidateIdentity=api;
})(typeof window!=='undefined'?window:globalThis);
