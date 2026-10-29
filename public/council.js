(function(root){
  'use strict';
  const $=id=>document.getElementById(id),M=()=>root.CouncilModel;
  const fmt=n=>new Intl.NumberFormat('pt-BR').format(n),pct=n=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2}).format(n)+'%';
  const palette=['#2563eb','#9baac1','#7c3aed','#e18b23'];
  let data=null,pending=null,ready=false,page=0,tab='results',a='',b='';
  const pageSize=20;
  function filters(){return {council:$('ct-council').value,search:$('ct-search').value,status:$('ct-status').value,pole:$('ct-pole').value,schoolSearch:$('ct-school-search').value};}
  function signature(){return JSON.stringify([2023,filters(),tab,a,b]);}
  function node(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
  function option(value,text){return new Option(text,value);}
  function setTab(value){tab=value;for(const button of document.querySelectorAll('[data-ct-tab]'))button.setAttribute('aria-pressed',String(button.dataset.ctTab===value));for(const panel of document.querySelectorAll('[data-ct-page]'))panel.hidden=panel.dataset.ctPage!==value;$('ct-csv').textContent={registers:'Exportar resumo CSV',map:'Exportar coordenadas CSV',history:'Exportar histórico CSV',schools:'Exportar escolas CSV'}[value]||'Exportar resultados CSV';if(data){summary();root.CouncilExtras?.update(data,tab);}}
  function summary(){
    const s=M().scope(data,filters().council);
    $('ct-scope').textContent=tab==='history'?'Ananindeua · totais municipais publicados em 2019 e 2023':(filters().council?'Conselho Tutelar '+filters().council:'Todos os quatro conselhos')+' · Ananindeua · eleição de 01/10/2023';
    $('ct-council').closest('label').hidden=tab==='history';$('ct-public-metrics').hidden=['registers','map','history'].includes(tab);
    $('ct-valid').textContent=fmt(s.reported.valid);$('ct-attendance').textContent=fmt(s.reported.attendance);
    $('ct-candidate-count').textContent=fmt(s.candidates.length);$('ct-elected-count').textContent=fmt(s.candidates.filter(c=>c.status==='elected').length)+' titulares eleitos';
    $('ct-pole-count').textContent=fmt(s.poles.length);$('ct-association-count').textContent=fmt(s.associated.length)+' vínculos de escolas de origem';
    $('ct-quality').hidden=!s.difference||['registers','map'].includes(tab);
    $('ct-scope-note').textContent=s.difference?'Percentuais por candidato usam a soma nominal do próprio conselho. No Conselho II, o total publicado diverge da soma das linhas.':'Percentuais por candidato usam a soma nominal das candidaturas do próprio conselho.';
    const kinds=[['Válidos publicados',s.reported.valid],['Brancos',s.reported.blank],['Nulos',s.reported.null],['Anulados',s.reported.annulled]];
    let angle=0;const stops=kinds.map(([,value],i)=>{const start=angle;angle+=value/s.reported.attendance*360;return `${palette[i]} ${start}deg ${angle}deg`;});
    $('ct-ring').style.background=`conic-gradient(${stops.join(',')})`;
    $('ct-ring').setAttribute('aria-label',kinds.map(([label,value])=>label+': '+fmt(value)).join('. '));
    $('ct-ring-total').textContent=fmt(s.reported.attendance);$('ct-legend').replaceChildren();
    for(const [i,[label,value]] of kinds.entries()){const li=node('li'),swatch=node('i');swatch.style.background=palette[i];li.append(swatch,node('span',label),node('strong',fmt(value)+' · '+pct(value/s.reported.attendance*100)));$('ct-legend').append(li);}
  }
  function candidateOptions(rows,select,prompt,value){select.replaceChildren(option('',prompt),...rows.map(c=>option(c.id,c.number+' — '+c.name+' · CT '+c.council)));select.value=rows.some(c=>c.id===value)?value:'';}
  function selectCandidate(id){a=id;b='';renderCandidates();$('ct-compare-panel').scrollIntoView?.({behavior:'smooth',block:'start'});$('ct-compare-b').focus?.({preventScroll:true});}
  function bar(candidate){
    const button=node('button',undefined,'ct-bar');button.type='button';button.dataset.ctCandidate=candidate.id;
    const name=node('span',candidate.name,'ct-bar-name');name.append(node('small',candidate.number+' · Conselho '+candidate.council));
    const track=node('span',undefined,'ct-track'),fill=node('i');track.setAttribute('aria-hidden','true');track.append(fill);
    button.append(name,track,node('strong',fmt(candidate.votes)));button.setAttribute('aria-label',candidate.name+', '+fmt(candidate.votes)+' votos. Abrir candidato.');
    return {button,fill};
  }
  function renderCandidates(){
    const rows=M().candidates(data,filters()),all=M().scope(data,filters().council).candidates;
    if(!rows.some(c=>c.id===a)){a='';b='';}
    const totalPages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,totalPages-1);
    $('ct-result-count').textContent=fmt(rows.length)+' candidato(s) no filtro · '+fmt(rows.reduce((n,c)=>n+c.votes,0))+' votos nas linhas encontradas';
    const body=$('ct-candidate-rows');body.replaceChildren();
    for(const c of rows.slice(page*pageSize,(page+1)*pageSize)){
      const tr=node('tr'),nameCell=node('td'),button=node('button',c.name,'ct-name-button');button.type='button';button.dataset.ctCandidate=c.id;button.append(node('small','Número '+c.number));nameCell.append(button);
      const statusCell=node('td'),status=node('span',M().statusLabel(c.status),'ct-status');status.dataset.status=c.status;statusCell.append(status);
      tr.append(node('td','CT '+c.council),nameCell,node('td',fmt(c.votes),'ct-number'),node('td',pct(c.share),'ct-number'),node('td',c.rank+'º','ct-number'),statusCell);body.append(tr);
    }
    $('ct-result-empty').hidden=Boolean(rows.length);$('ct-result-table').hidden=!rows.length;
    $('ct-page').textContent=rows.length?`Página ${page+1} de ${totalPages} · ${page*pageSize+1}–${Math.min(rows.length,(page+1)*pageSize)} de ${rows.length}`:'Nenhum candidato encontrado';
    $('ct-prev').disabled=page===0;$('ct-next').disabled=page+1>=totalPages;
    const top=[...rows].sort((x,y)=>y.votes-x.votes).slice(0,10),max=Math.max(1,...top.map(c=>c.votes));$('ct-ranking').replaceChildren();
    for(const c of top){const item=bar(c);item.fill.style.width=(c.votes/max*100)+'%';$('ct-ranking').append(item.button);}
    if(!top.length)$('ct-ranking').append(node('p','Sem candidatos neste filtro.','ct-empty'));
    candidateOptions(rows,$('ct-compare-a'),'Escolha um candidato',a);
    const left=M().candidate(data,a),others=left?all.filter(c=>c.council===left.council&&c.id!==a):[];
    candidateOptions(others,$('ct-compare-b'),left?'Outro candidato do Conselho '+left.council:'Escolha o primeiro candidato',b);
    b=$('ct-compare-b').value;$('ct-compare-b').disabled=!left;
    $('ct-candidate-detail').hidden=!left;$('ct-compare-help').hidden=Boolean(left);
    const detail=$('ct-candidate-detail');detail.replaceChildren();if(!left)return;
    const cards=node('div',undefined,'ct-compare-result');
    const values=b?(()=>{const comparison=M().compare(data,a,b);return [[comparison.left.name,fmt(comparison.left.votes)+' votos',pct(comparison.left.share)+' nominal · '+comparison.left.rank+'º'],[comparison.right.name,fmt(comparison.right.votes)+' votos',pct(comparison.right.share)+' nominal · '+comparison.right.rank+'º'],['Diferença A − B',(comparison.difference>0?'+':'')+fmt(comparison.difference)+' votos','CT '+left.council+' · '+pct(comparison.shareDifference).replace('%','')+' p.p.']];})():[[left.name,fmt(left.votes)+' votos','Número '+left.number],['Participação nominal',pct(left.share),'Soma nominal do CT '+left.council+': '+fmt(left.denominator)],['Classificação',left.rank+'º',M().statusLabel(left.status)]];
    for(const [label,value,description] of values){const card=node('div');card.append(node('small',label),node('strong',value),node('small',description));cards.append(card);}detail.append(cards);
    if(b){const comparison=M().compare(data,a,b),chart=node('div',undefined,'ct-bars');chart.style.marginTop='1rem';const maxVotes=Math.max(1,comparison.left.votes,comparison.right.votes);for(const c of [comparison.left,comparison.right]){const item=bar(c);item.fill.style.width=c.votes/maxVotes*100+'%';chart.append(item.button);}detail.append(chart);}
    detail.append(node('p','Os candidatos concorreram ao Conselho '+left.council+'. A comparação mostra votos totais e participação nominal nesse conselho.','compact-note'));
    detail.append(node('p','Referência do 5º colocado: '+fmt(left.fifthVotes)+' votos. Diferença do candidato A em relação ao 5º: '+(left.differenceToFifth>0?'+':'')+fmt(left.differenceToFifth)+' votos.','compact-note'));
  }
  function fillPoles(){const old=$('ct-pole').value,rows=M().scope(data,filters().council).poles;$('ct-pole').replaceChildren(option('','Todos os polos do recorte'),...rows.map(p=>option(p.id,'CT '+p.council+' · Polo '+p.number+' — '+p.name)));$('ct-pole').value=rows.some(p=>p.id===old)?old:'';}
  function renderSchools(){
    const rows=M().schools(data,filters()),box=$('ct-school-list');box.replaceChildren();
    $('ct-school-count').textContent=fmt(rows.length)+' polo(s) · '+fmt(rows.reduce((n,p)=>n+p.associated.length,0))+' vínculo(s) de escolas de origem no filtro';
    for(const p of rows){const article=node('article',undefined,'ct-school');article.append(node('span','Conselho '+p.council+' · Polo '+p.number,'ct-school-tag'),node('h3',p.name),node('p',p.address));
      if(p.id===data.annulment.poleId)article.append(node('p','Urna 031: 348 votos anulados. O resultado do conselho já considera a anulação.','ct-alert'));
      const details=node('details'),summary=node('summary',fmt(p.associated.length)+' escola(s) de origem e respectivas seções'),list=node('ul');
      for(const source of p.associated){const li=node('li',source.name);li.append(node('span','Seções na publicação: '+(source.sections||'Não informadas')));list.append(li);}details.append(summary,list);article.append(details,node('p','Diário Oficial, página(s) '+p.pages.join(', ')));box.append(article);
    }
    if(!rows.length)box.append(node('p','Nenhuma escola encontrada. Tente parte do nome, endereço ou número da seção.','ct-empty'));
  }
  function render(){summary();renderCandidates();renderSchools();root.CouncilExtras?.update(data,tab);}
  function csv(){
    if(['registers','history','map'].includes(tab)){root.CouncilExtras?.exportCSV(tab);return;}
    if(!data)return;const f=filters();let rows;
    if(tab==='schools'){rows=[['Ano','Município','Conselho','Polo','Escola polo','Endereço','Escola de origem','Seções publicadas (zona não informada)','Fonte']];for(const p of M().schools(data,f))for(const source of p.associated)rows.push([2023,'Ananindeua',p.council,p.number,p.name,p.address,source.name,source.sections,data.sources.schools.url]);}
    else rows=[['Ano','Município','Conselho','Número','Candidato','Votos','Classificação','Situação','Participação na soma nominal do conselho (%)','Fonte'],...M().candidates(data,f).map(c=>[2023,'Ananindeua',c.council,c.number,c.name,c.votes,c.rank,M().statusLabel(c.status),c.share.toLocaleString('pt-BR',{maximumFractionDigits:4}),data.sources.results.url])];
    const quote=v=>'"'+String(/^[=+@-]/.test(String(v))?"'"+v:v??'').replace(/"/g,'""')+'"';
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'})),link=node('a');link.href=url;link.download='Conselho_Tutelar_Ananindeua_2023_'+(tab==='schools'?'escolas':'resultados')+'.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function report(){
    if(tab==='registers'){root.CouncilExtras?.privateReport();return;}
    if(tab==='history'){root.CouncilExtras?.historyReport();return;}
    if(tab==='map'){root.CouncilExtras?.mapReport();return;}
    if(!data)return;
    const prepare=(kind,associated=false)=>({report:M().report(data,filters(),kind,{a,b,associated}),filename:'Conselho_Tutelar_Ananindeua_2023_'+kind+'.pdf'});
    const options=[{id:'summary',label:'Resumo de uma página A4',description:'Panorama do conselho, cinco maiores votações do filtro, totais e observações da fonte. Não contém a listagem completa.',singlePage:true,prepare:()=>prepare('summary')},
      {id:'candidates',label:'Todos os candidatos do filtro',description:'Preserva todas as candidaturas encontradas, com votos, classificação e participação nominal. Use o formato Enxuto para a lista completa.',prepare:()=>prepare('candidates'),prepareSummary:()=>prepare('summary')},
      {id:'schools',label:'Escolas polo de votação',description:'Somente os polos e endereços encontrados nos filtros da aba Escolas. As escolas de origem não entram nesta opção.',prepare:()=>prepare('schools')},
      {id:'associated',label:'Polos, escolas de origem e seções',description:'Relação detalhada das escolas do filtro. Pode gerar mais páginas. A fonte não informa a zona das seções.',prepare:()=>prepare('schools',true)}];
    if(a)options.push({id:'candidate',label:b?'Comparativo dos dois candidatos selecionados':'Candidato selecionado',description:'Votos, participação nominal, classificação e gráfico. Comparações somente no mesmo conselho.',prepare:()=>prepare('candidate')});
    root.ReportCenter.open({signature,defaultType:tab==='schools'?'schools':'summary',defaultFormat:tab==='schools'?'compact':'summary',options});
  }
  function init(){
    if(ready)return;ready=true;root.CouncilExtras?.init();
    $('ct-council').addEventListener('change',()=>{if(!data)return;page=0;a='';b='';fillPoles();render();});
    for(const id of ['ct-search','ct-status'])$(id).addEventListener(id==='ct-search'?'input':'change',()=>{if(data){page=0;renderCandidates();}});
    for(const id of ['ct-school-search','ct-pole'])$(id).addEventListener(id==='ct-school-search'?'input':'change',()=>{if(data)renderSchools();});
    $('ct-clear').addEventListener('click',()=>{$('ct-search').value='';$('ct-status').value='';page=0;a='';b='';if(data)renderCandidates();});
    $('ct-school-clear').addEventListener('click',()=>{$('ct-school-search').value='';$('ct-pole').value='';if(data)renderSchools();});
    $('ct-prev').addEventListener('click',()=>{page--;renderCandidates();});$('ct-next').addEventListener('click',()=>{page++;renderCandidates();});
    $('ct-compare-a').addEventListener('change',()=>{a=$('ct-compare-a').value;b='';renderCandidates();});$('ct-compare-b').addEventListener('change',()=>{b=$('ct-compare-b').value;renderCandidates();});
    $('ct-panel').addEventListener('click',event=>{const candidate=event.target.closest?.('[data-ct-candidate]');if(candidate)selectCandidate(candidate.dataset.ctCandidate);const target=event.target.closest?.('[data-ct-tab]');if(target)setTab(target.dataset.ctTab);});
    $('ct-pdf').addEventListener('click',report);$('ct-csv').addEventListener('click',csv);$('ct-retry').addEventListener('click',()=>{pending=null;activate();});
    setTab(tab);
  }
  async function activate(){
    init();if(data){render();return data;}if(pending)return pending;
    $('ct-loading').textContent='Carregando escolas e conferindo os resultados de 2023…';$('ct-retry').hidden=true;
    pending=(async()=>{try{const response=await fetch('/council-data/ananindeua-2023.json',{credentials:'same-origin'});if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('A base não está disponível. Conecte à internet ou prepare o uso offline.');data=M().validate(await response.json());fillPoles();render();$('ct-output').hidden=false;$('ct-loading').textContent='Base de 2023 carregada: 131 candidatos, 34 polos e 124 vínculos de escolas de origem.';$('ct-pdf').disabled=false;$('ct-csv').disabled=false;return data;}catch(error){data=null;pending=null;$('ct-output').hidden=true;$('ct-loading').textContent=error.message||'Não foi possível abrir a base.';$('ct-retry').hidden=false;return null;}})();
    return pending;
  }
  root.CouncilTutelar={init,activate};
})(window);
