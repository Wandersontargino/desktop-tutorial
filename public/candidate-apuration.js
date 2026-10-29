(function(root){
  'use strict';
  const sourceURL='https://dadosabertos.tse.jus.br/dataset/resultados-2026';
  const names={estadual:'Deputado Estadual',federal:'Deputado Federal'};
  const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
  const fmt=n=>new Intl.NumberFormat('pt-BR').format(n);
  function normalizeSelection(ids,roster){
    const allowed=new Set(roster.map(c=>String(c[0]))),seen=new Set();return [0,1].map(i=>{const id=String(ids?.[i]||'');if(!allowed.has(id)||seen.has(id))return '';seen.add(id);return id;});
  }
  function data(state,id,complete=false){
    const {city,index,office,statewide}=state;
    if(!names[office]||index?.electionYear!==2026||city?.y!==2026||city.o!==office||index.office!==office)throw new Error('Use a base de 2026 do cargo selecionado.');
    const candidate=city.c.find(c=>String(c[0])===String(id));if(!candidate)throw new Error('Selecione o candidato que deseja consultar.');
    const metadata=new Map(index.municipalities.map(r=>[String(r[0]),r[1]])),municipalities=new Map(),zones=new Map();let votes=0;
    const filters=complete?{}:{zone:state.territoryZone||'',section:state.territorySection||'',place:state.territoryPlaces?.length?'':state.territoryPlace||'',places:state.territoryPlaces||[],neighborhood:state.territoryNeighborhood||''};
    if(complete){
      if(statewide?.electionYear!==2026||statewide.office!==office)throw new Error('A base estadual do cargo está indisponível.');
      const record=statewide.candidates.find(c=>String(c[0])===String(id));
      if(!record||String(record[1])!==String(candidate[1])||normalize(record[2])!==normalize(candidate[2]))throw new Error('A identificação do candidato não confere na base estadual.');
      const totals=new Map(record[6].map(([code,v])=>[String(code),v]));
      for(const [code,name]of metadata){const value=totals.get(code)||0;municipalities.set(code,{code,name,votes:value});votes+=value;}
      if(votes!==record[3])throw new Error('A soma municipal não confere com a fonte estadual.');
    }else{
      const totals=new Map(candidate[5]),codes=city.isStatewide?[...metadata.keys()]:city.municipalityCodes?.map(String)||[String(city.m[0])];
      const schoolSet=new Set(filters.places),filtered=Object.values(filters).some(value=>Array.isArray(value)?value.length>0:!!value);
      if(!filtered)for(const code of codes)if(metadata.has(code))municipalities.set(code,{code,name:metadata.get(code),votes:0});
      for(let i=0;i<city.s.length;i++){
        const row=city.s[i],code=String(row[4]||city.m[0]);
        if(!metadata.has(code)||filters.zone&&Number(filters.zone)!==Number(row[0])||filters.section&&Number(filters.section)!==Number(row[1])||filters.place&&normalize(filters.place)!==normalize(row[2])||schoolSet.size&&!schoolSet.has(row[2])||filters.neighborhood&&normalize(filters.neighborhood)!==normalize(row[3]))continue;
        const value=totals.get(i)||0;if(!Number.isSafeInteger(value)||value<0)throw new Error('Votação inválida na fonte selecionada.');
        if(!municipalities.has(code))municipalities.set(code,{code,name:metadata.get(code),votes:0});municipalities.get(code).votes+=value;
        const zone=String(Number(row[0])),key=code+'|'+zone;if(!zones.has(key))zones.set(key,{code,name:metadata.get(code),zone,votes:0});zones.get(key).votes+=value;votes+=value;
      }
    }
    return {candidate,office,scope:complete?'Todos os municípios do Pará':city.m[1],source:index.source,sourceURL,filters,complete,votes,
      municipalities:[...municipalities.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')),
      zones:[...zones.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')||Number(a.zone)-Number(b.zone))};
  }
  function report(result){
    const c=result.candidate;
    return {electionYear:2026,turn:1,title:'Apuração individual',subtitle:c[1]+' — '+c[2],generatedAt:new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),compactIndicators:true,
      meta:[['Cargo',names[result.office]],['Eleição','2026 • 1º turno • Pará'],['Recorte',result.scope],['Fonte',result.source],['Consulta oficial',sourceURL],['Filtros',Object.entries(result.filters).filter(([,v])=>Array.isArray(v)?v.length>0:!!v).map(([k,v])=>({zone:'Zona',section:'Seção',place:'Local',places:'Locais selecionados',neighborhood:'Bairro'}[k])+': '+(Array.isArray(v)?v.join('; '):v)).join(' • ')||'Todos do recorte']],
      indicators:[{label:'Votos nominais no recorte',value:fmt(result.votes)}],note:'Resultados individuais da base identificada. Municípios e zonas em ordem alfabética e numérica. Esta consulta não identifica votos individuais de eleitores.',
      blocks:[{type:'table',title:'Votação por município',headers:['Município','Votos'],widths:[4,1],rows:result.municipalities.map(r=>[r.name,fmt(r.votes)])},...(result.zones.length?[{type:'table',title:'Votação por zona',headers:['Município','Zona','Votos'],widths:[4,1,1],rows:result.zones.map(r=>[r.name,r.zone.padStart(3,'0'),fmt(r.votes)])}]:[])]};
  }
  const model={data,report,normalizeSelection};
  if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}
  const $=id=>document.getElementById(id);let api,focused=0,mode='both',ready=false,result=null;
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function slots(){const state=api.getState();return (mode==='first'?[0]:mode==='second'?[1]:[0,1]).filter(i=>state.compareCandidateIds[i]&&state.city?.c.some(c=>String(c[0])===String(state.compareCandidateIds[i])));}
  function signature(){const s=api.getState();return JSON.stringify([mode,focused,s.office,s.indexRequest,s.index?.source,s.cityCode,s.cityRequest,s.compareCandidateIds,s.territoryZone,s.territorySection,s.territoryPlace,s.territoryPlaces,s.territoryNeighborhood]);}
  function render(){
    if(!api)return;const state=api.getState();if(state.view!=='comparison')return;
    $('candidate-query-mode').value=mode;
    $('compare-select-1').closest('label').hidden=mode==='second';$('compare-select-2').closest('label').hidden=mode==='first';
    $('compare-select-1').disabled=mode==='second';$('compare-select-2').disabled=mode==='first';
    const available=slots();if(!available.includes(focused))focused=available[0]??(mode==='second'?1:0);
    $('candidate-query-focus-field').hidden=mode!=='both';
    $('candidate-query-focus').replaceChildren(...available.map(i=>{const c=state.city.c.find(c=>String(c[0])===String(state.compareCandidateIds[i]));return new Option('Candidato '+(i+1)+' — '+c[1]+' — '+c[2],String(i));}));$('candidate-query-focus').value=String(focused);$('candidate-query-focus').disabled=available.length<2;
    $('comparison-selection-note').textContent=mode==='both'?'Escolha os dois candidatos. Use “Exibir apuração” para abrir cada consulta individual.':mode==='first'?'Apuração somente do candidato 1.':'Apuração somente do candidato 2.';
    $('comparison-context').textContent=state.city.m[1]+' • '+names[state.office]+' • 2026 • 1º turno';
    $('comparison-scope-note').textContent='Cada consulta e relatório apresenta os dados de um candidato, com a fonte e os filtros identificados.';
    result=null;
    try{if(available.length)result=data(state,state.compareCandidateIds[focused]);}catch(e){$('candidate-query-status').textContent=e.message;}
    const enabled=!!result&&result.municipalities.length>0;
    $('complete-report-button').disabled=!enabled;$('export-comparison-button').disabled=!enabled;$('print-comparison-button').disabled=!enabled;
    $('candidate-query-output').hidden=!result;
    if(!result){$('candidate-query-name').textContent='';$('candidate-query-votes').textContent='';$('candidate-query-municipalities').replaceChildren();$('candidate-query-zones').replaceChildren();if(!available.length)$('candidate-query-status').textContent='Selecione o candidato no campo disponível para consultar sua apuração.';return;}
    $('candidate-query-name').textContent=result.candidate[1]+' — '+result.candidate[2];$('candidate-query-votes').textContent=fmt(result.votes);
    $('candidate-query-source').textContent=result.source;$('candidate-query-status').textContent=result.municipalities.length?'Apuração individual • '+result.scope:'Nenhuma seção corresponde aos filtros atuais.';
    $('candidate-query-municipalities').innerHTML=result.municipalities.map(r=>`<tr><td>${escape(r.name)}</td><td>${fmt(r.votes)}</td></tr>`).join('');
    $('candidate-query-zones').innerHTML=result.zones.map(r=>`<tr><td>${escape(r.name)}</td><td>${escape(r.zone.padStart(3,'0'))}</td><td>${fmt(r.votes)}</td></tr>`).join('');
  }
  function openReports(){
    const available=slots();if(!available.length)return api.toast('Selecione o candidato que deseja consultar.','error');
    const initial=signature(),s=api.getState(),options=available.flatMap(slot=>{const id=s.compareCandidateIds[slot],c=s.city.c.find(c=>String(c[0])===String(id));return [false,true].map(complete=>({id:'individual_'+slot+(complete?'_state':'_scope'),label:c[1]+' — '+(complete?'Todos os municípios do Pará':'Recorte selecionado'),description:'Relatório individual, com votação municipal'+(complete?'.':' e por zona, seguindo os filtros ativos.'),prepare:()=>{if(signature()!==initial)throw new Error('A consulta mudou. Abra novamente o relatório com a seleção atual.');return {report:report(data(api.getState(),id,complete)),filename:'APURACAO_INDIVIDUAL_'+s.office+'_'+c[1]+(complete?'_PARA':'_RECORTE')+'_2026.pdf'};}}));});
    root.ReportCenter.open({options,defaultType:'individual_'+focused+'_scope',layout:'consolidated',signature});
  }
  function csv(){if(!result)return;const rows=[['APURAÇÃO INDIVIDUAL','2026','1º turno'],['Candidato',result.candidate[1],result.candidate[2]],['Cargo',names[result.office]],['Recorte',result.scope],['Fonte',result.source],['Consulta oficial',sourceURL],['Votos',result.votes],[],['Município','Votos'],...result.municipalities.map(r=>[r.name,r.votes]),[],['Município','Zona','Votos'],...result.zones.map(r=>[r.name,r.zone,r.votes])];
    const content='\ufeff'+rows.map(row=>row.map(v=>'"'+String(/^[=+@-]/.test(String(v))?"'"+v:v).replace(/"/g,'""')+'"').join(';')).join('\r\n');api.download('APURACAO_INDIVIDUAL_'+result.candidate[1]+'_2026.csv',content);api.toast('Apuração individual exportada em CSV.');
  }
  function init(callbacks){if(ready)return;ready=true;api=callbacks;$('candidate-query-mode').addEventListener('change',e=>{mode=e.target.value;render();});$('candidate-query-focus').addEventListener('change',e=>{focused=Number(e.target.value);render();});}
  root.CandidateApuration={...model,init,render,openReports,csv,signature,getMode:()=>mode};
})(typeof window!=='undefined'?window:globalThis);
