(function(root){
  'use strict';
  const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const int=n=>n==null?'—':n.toLocaleString('pt-BR'),signed=n=>n==null?'—':(n>0?'+':'')+int(n),pct=n=>n==null?'—':(n>0?'+':'')+(100*n).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
  let context,result=null,epoch=0,reportData=null,stamp='';
  const signature=()=>{const s=context.getState();return JSON.stringify([s.office,s.candidate?.[0],root.PlatformTools.manifests.get(s.office)?.active]);};
  async function json(path){const r=await fetch(path,{credentials:'same-origin',cache:'no-store'});if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw new Error('Arquivo indisponível. Conecte à internet ou prepare o uso offline.');return r.json();}
  function clear(){epoch++;result=null;reportData=null;$('zone-history-output').hidden=true;$('zone-history-report').disabled=true;}
  async function open(){
    clear();$('zone-history-dialog').showModal();const s=context.getState(),candidate=s.candidate,run=epoch;
    if(!candidate)return $('zone-history-status').textContent='Escolha um candidato no filtro principal e abra esta ferramenta novamente.';
    stamp=signature();$('zone-history-status').textContent='Conferindo o histórico do candidato e os locais transferidos das zonas 43 e 72…';
    try{
      const [catalog,prior,manifest]=await Promise.all([json('/zone-107-crosswalk.json'),context.getHistorical(candidate),json('/api/election/'+s.office+'/manifest')]);
      if(!prior?.previous||!prior.history||prior.history.unavailable)throw new Error('Sem histórico elegível por local de votação para este candidato em 2022. A plataforma não cria comparação para candidaturas sem correspondência confirmada.');
      const city=await json(`/api/election/${s.office}/data/4154.json?version=${encodeURIComponent(manifest.active)}`),after=await json('/api/election/'+s.office+'/manifest');
      if(run!==epoch||signature()!==stamp)return;
      if(manifest.active!==after.active)throw new Error('A base mudou durante a consulta. Abra a reconstrução novamente.');
      result=root.ZoneHistoryModel.reconstruct({catalog,history:prior.history,currentCity:city,currentRoster:s.statewide,candidateId:candidate[0],historicalCandidateId:prior.previous[0],office:s.office});
      reportData={name:root.CandidateIdentity?.ballot(candidate,s.office)||candidate[2],number:candidate[1],version:manifest.active};
      render();$('zone-history-status').textContent='Reconstrução parcial concluída. Somente correspondências documentadas entram no comparativo.';
    }catch(e){if(run===epoch)$('zone-history-status').textContent=e.message;}
  }
  function render(){
    $('zone-history-output').hidden=false;$('zone-history-report').disabled=false;
    $('zone-history-candidate').textContent=reportData.name+' • '+reportData.number;
    const tone=result.delta>0?'is-ok':result.delta<0?'is-priority':'';
    $('zone-history-metrics').innerHTML=[['2022 — mesmos locais',int(result.previous),''],['2026 — mesmos locais',int(result.current),''],['Diferença de votos',signed(result.delta)+' • '+pct(result.percent),tone],['Locais comparáveis',result.comparable+' / '+result.planned,'']].map(([label,value,color])=>`<div class="metric-card ${color}"><span>${label}</span><strong>${esc(value)}</strong></div>`).join('');
    $('zone-history-reading').textContent=`${result.mapped} dos ${result.planned} locais do anexo têm correspondência em 2022; ${result.comparable} também correspondem ao local da zona 107 na base ativa de 2026. A evolução usa apenas esses mesmos locais. Reconstrução disponível de 2022: ${int(result.reconstructed2022)} votos. Total da zona 107 em 2026: ${int(result.fullZone2026)} votos, mostrado separadamente. Se a base de 2022 for zero, a variação percentual fica sem cálculo.`;
    const labels={comparable:'Comparável','2022-only':'Atual não confirmado','2026-only':'Histórico não confirmado',unresolved:'Correspondência pendente'};
    $('zone-history-rows').innerHTML=result.rows.map(r=>`<tr><td>${esc(r.name)}<small>${esc(labels[r.status])}</small></td><td>${esc(r.origin||'—')}</td><td>${int(r.historicalVotes)}</td><td>${int(r.currentVotes)}</td><td class="${r.delta>0?'positive-text':r.delta<0?'negative-text':''}">${signed(r.delta)}<small>${r.comparable?pct(r.percent):'Fora do comparativo'}</small></td></tr>`).join('');
    const top=result.rows.filter(r=>r.comparable).sort((a,b)=>b.currentVotes-a.currentVotes).slice(0,8),maximum=Math.max(1,...top.flatMap(r=>[r.currentVotes,r.historicalVotes]));
    $('zone-history-chart').innerHTML=top.map(r=>`<div class="archive-chart-row"><strong>${esc(r.name)}</strong>${[['2022',r.historicalVotes,''],['2026',r.currentVotes,'federal']].map(([year,n,color])=>`<div class="archive-bar-line"><span>${year}</span><div class="archive-bar-track"><i class="${color}" style="width:${100*n/maximum}%"></i></div><span>${int(n)}</span></div>`).join('')}</div>`).join('');
  }
  function report(){
    if(!result||signature()!==stamp)return $('zone-history-status').textContent='O candidato ou a base mudou. Abra a reconstrução novamente.';
    const snapshot=result,identity=reportData,guard=stamp;
    root.ReportCenter.open({signature:()=>signature(),options:[{id:'zone107',label:'Zona 107 — reconstrução de 2022',description:'Relatório compacto por local transferido, sem páginas por seção. Lacunas documentais ficam identificadas.',prepare:async()=>{
      if(signature()!==guard)throw new Error('A consulta mudou. Abra a reconstrução novamente.');
      return {filename:'ZONA_107_RECONSTRUCAO_2022_2026.pdf',report:{title:'Zona 107 — reconstrução territorial',subtitle:identity.number+' — '+identity.name,headerSubtitle:'Ananindeua • reconstrução de 2022 por locais transferidos',generatedAt:new Date().toLocaleString('pt-BR'),compactIndicators:true,indicatorColumns:4,meta:[['Base 2026',identity.version+' • '+snapshot.office],['Cobertura',snapshot.comparable+' de '+snapshot.planned+' locais comparáveis; '+snapshot.mapped+' identificados em 2022'],['Origem 2022',snapshot.origins.map(r=>'Zona '+r.zone+': '+r.locations+' locais; '+int(r.votes)+' votos').join(' • ')],['Referência territorial',snapshot.catalog.source]],indicators:[{label:'2022 — mesmos locais',value:int(snapshot.previous)},{label:'2026 — mesmos locais',value:int(snapshot.current)},{label:'Diferença',value:signed(snapshot.delta),note:pct(snapshot.percent),color:snapshot.delta>0?'#208a5b':snapshot.delta<0?'#bc3030':null},{label:'Cobertura',value:snapshot.comparable+' / '+snapshot.planned}],note:'A zona 107 foi instalada depois de 2022. Este relatório reconstrói locais transferidos das zonas 43 e 72; não é resultado oficial de uma zona 107 em 2022. A evolução usa somente locais confirmados nos dois anos. O total integral de 2026 ('+int(snapshot.fullZone2026)+' votos) não é comparado ao subtotal histórico. O anexo de 2023 não fornece o de-para individual das seções; não há renumeração presumida. Local sem correspondência fica fora do cálculo. Percentual não calculado quando 2022 = 0.',blocks:[{type:'bars',title:'Votação nos mesmos locais — 2022 / 2026',rows:[{label:'Locais comparáveis',values:[{label:'2022',value:snapshot.previous,color:'#2358ed'},{label:'2026',value:snapshot.current,color:'#148379'}]}]},{type:'table',title:'Locais e cobertura documental',compact:true,headers:['Local de votação','Zona em 2022','Votos 2022','Votos 2026','Diferença'],widths:[3.2,.8,.8,.8,1.2],rows:snapshot.rows.map(r=>[r.name,r.origin||'—',int(r.historicalVotes),int(r.currentVotes),r.comparable?signed(r.delta)+' / '+pct(r.percent):'Não comparável']),cellColors:snapshot.rows.map(r=>[null,null,null,null,r.delta>0?'#208a5b':r.delta<0?'#bc3030':null])},{type:'paragraph',text:'Fontes: '+snapshot.catalog.sourceURL+' • '+snapshot.catalog.annexURL}]}};
    }}],defaultType:'zone107'});
  }
  function init(options){context=options;$('open-zone-history')?.addEventListener('click',open);$('zone-history-close')?.addEventListener('click',()=>{$('zone-history-dialog').close();clear();});$('zone-history-report')?.addEventListener('click',report);}
  root.ZoneHistory={init};
})(window);
