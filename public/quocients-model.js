(function(root){
  'use strict';
  const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
  const integer=(v,label)=>{if(!/^\d+$/.test(String(v))||!Number.isSafeInteger(Number(v)))throw new Error(label+' inválido na fonte do TSE.');return Number(v);};
  const sum=(rows,key)=>rows.reduce((n,r)=>n+r[key],0);
  const officeNames={estadual:'Deputado Estadual',federal:'Deputado Federal'};
  // Código Eleitoral, art. 106: exactly half is discarded, not rounded up.
  function electoralQuotient(votes,seats){if(!Number.isSafeInteger(votes)||votes<0||!Number.isSafeInteger(seats)||seats<1)throw new Error('Votos ou vagas inválidos.');const base=Math.floor(votes/seats);return base+(votes%seats>seats/2?1:0);}
  function validate(data,office=data?.office){
    if(data?.schema!==1||data.electionYear!==2026||data.turn!==1||data.uf!=='PA'||!officeNames[office]||data.office!==office||data.scope!=='uf'||data.phase!=='oficial')throw new Error('Fonte incompatível: selecione o cargo, Pará, 2026 e 1º turno no ambiente oficial.');
    for(const key of ['validVotes','nominalVotes','partyVotes','seats','qe','electedQP','electedAverage'])integer(data[key],key);
    if(!data.seats||!data.qe||data.validVotes!==data.nominalVotes+data.partyVotes||electoralQuotient(data.validVotes,data.seats)!==data.qe)throw new Error('Votos válidos, vagas e quociente eleitoral não conferem.');
    if(!Array.isArray(data.groups)||!data.groups.length)throw new Error('Composições ausentes na fonte.');
    const ids=new Set(),candidates=new Set();
    for(const group of data.groups){
      if(!group.id||ids.has(group.id)||!group.name||!group.label||!['party','federation'].includes(group.type)||!Array.isArray(group.candidates))throw new Error('Composição repetida ou inválida.');ids.add(group.id);
      for(const key of ['nominalVotes','partyVotes','validVotes','initialQP','electedQP','electedAverage','seats'])integer(group[key],key);
      if(group.validVotes!==group.nominalVotes+group.partyVotes||group.initialQP!==Math.floor(group.validVotes/data.qe)||group.seats!==group.electedQP+group.electedAverage)throw new Error('Totais de votos ou vagas da composição não conferem.');
      for(const c of group.candidates){if(!c.id||candidates.has(c.id)||!c.name||!c.number||!c.status||!['qp','average','other'].includes(c.method))throw new Error('Candidatura repetida ou inválida.');candidates.add(c.id);integer(c.votes,'Votos do candidato');}
      if(group.candidates.filter(c=>c.method==='qp').length!==group.electedQP||group.candidates.filter(c=>c.method==='average').length!==group.electedAverage)throw new Error('Situação dos eleitos diverge das vagas da composição.');
    }
    if(sum(data.groups,'nominalVotes')!==data.nominalVotes||sum(data.groups,'partyVotes')!==data.partyVotes||sum(data.groups,'electedQP')!==data.electedQP||sum(data.groups,'electedAverage')!==data.electedAverage)throw new Error('A soma das composições diverge do total estadual.');
    if(data.electedQP+data.electedAverage>data.seats||data.final&&data.electedQP+data.electedAverage!==data.seats)throw new Error('As vagas preenchidas divergem do total do cargo.');
    if(!/^https:\/\/resultados\.tse\.jus\.br\/oficial\/ele2026\/\d+\/dados\/pa\/pa-c000[67]-e\d+-u\.json$/.test(data.source?.url||'')||!/^\d{2}\/\d{2}\/2026 \d{2}:\d{2}:\d{2}$/.test(data.generatedAt||''))throw new Error('Fonte ou data de geração inválida.');
    return data;
  }
  function parseOfficial(raw,office,election='6259'){
    const code=office==='estadual'?'7':office==='federal'?'6':'';
    if(!code||raw?.ele!==String(election)||raw.t!=='1'||raw.f!=='o'||raw.sup!=='n'||raw.tpabr!=='uf'||raw.cdabr!=='pa'||!/^\d{2}\/\d{2}\/2026$/.test(raw.dt||''))throw new Error('Arquivo de outra eleição, cargo, ambiente ou circunscrição.');
    const cargo=raw.carg?.find(c=>String(c.cd)===code);if(!cargo||!Array.isArray(cargo.agr))throw new Error('Cargo ausente na fonte oficial.');
    const groups=cargo.agr.map(g=>{
      if(!Array.isArray(g.par)||!g.par.length||!['i','f'].includes(g.tp))throw new Error('Composição proporcional inválida.');
      const parties=g.par.map(p=>({id:String(p.n),label:String(p.sg),nominalVotes:integer(p.tvtn,'Votos nominais válidos'),partyVotes:integer(p.tvtl,'Votos de legenda válidos')}));
      const candidates=g.par.flatMap(p=>(p.cand||[]).map(c=>{
        let method='other';if(c.e==='s'){const status=normalize(c.st);method=status==='ELEITO POR QP'?'qp':status==='ELEITO POR MEDIA'?'average':'';if(!method)throw new Error('Forma de eleição não reconhecida.');}
        return {id:String(c.sqcand||''),number:String(c.n||''),name:String(c.nmu||c.nm||''),fullName:String(c.nm||''),party:String(p.sg||''),votes:integer(c.vap,'Votos nominais'),destination:String(c.dvt||''),status:String(c.st||''),method};
      }));
      // tvtn/tvtl reconcile to vv. tvan/tval can include sub judice votes.
      const nominalVotes=sum(parties,'nominalVotes'),partyVotes=sum(parties,'partyVotes'),validVotes=nominalVotes+partyVotes;
      const electedQP=candidates.filter(c=>c.method==='qp').length,electedAverage=candidates.filter(c=>c.method==='average').length;
      if(integer(g.vag,'Vagas oficiais da composição')!==electedQP+electedAverage)throw new Error('Vagas oficiais sem correspondência na situação dos candidatos.');
      return {id:String(g.n||''),name:String(g.nm||''),label:String(g.com||parties.map(p=>p.label).join(' / ')),type:g.tp==='f'?'federation':'party',parties,nominalVotes,partyVotes,validVotes,initialQP:Math.floor(validVotes/integer(cargo.qe,'QE')),electedQP,electedAverage,seats:electedQP+electedAverage,candidates};
    }).sort((a,b)=>b.validVotes-a.validVotes||a.label.localeCompare(b.label,'pt-BR'));
    const source='https://resultados.tse.jus.br/oficial/ele2026/'+election+'/dados/pa/pa-c'+code.padStart(4,'0')+'-e'+String(election).padStart(6,'0')+'-u.json';
    return validate({schema:1,electionYear:2026,turn:1,uf:'PA',scope:'uf',phase:'oficial',office,seats:integer(cargo.nv,'Vagas'),qe:integer(cargo.qe,'QE'),validVotes:integer(raw.v?.vv,'Votos válidos'),nominalVotes:integer(raw.v?.vnom,'Votos nominais válidos'),partyVotes:integer(raw.v?.vl,'Legenda válida'),electedQP:sum(groups,'electedQP'),electedAverage:sum(groups,'electedAverage'),final:raw.tf==='s'&&raw.and==='f',generatedAt:raw.dg+' '+raw.hg,totalizedAt:raw.dt+' '+raw.ht,generationId:String(raw.idg||''),source:{title:'TSE — Resultados oficiais 2026',url:source},groups},office);
  }
  function query(data,{group='',search='',electedOnly=true}={}){
    const term=normalize(search),matches=c=>!term||normalize(c.number+' '+c.name+' '+c.fullName+' '+c.party).includes(term);
    const groups=data.groups.filter(g=>(!group||g.id===group)&&(!term||normalize(g.label+' '+g.name).includes(term)||g.candidates.some(matches)));
    const candidates=groups.flatMap(g=>g.candidates.filter(c=>(!electedOnly||c.method!=='other')&&(!term||normalize(g.label+' '+g.name).includes(term)||matches(c))).map(c=>({...c,group:g.label}))).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name,'pt-BR'));
    return {groups,candidates,seats:sum(groups,'seats'),validVotes:sum(groups,'validVotes')};
  }
  const api={normalize,electoralQuotient,validate,parseOfficial,query,officeNames};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.QuocientsModel=api;
})(typeof window!=='undefined'?window:globalThis);
