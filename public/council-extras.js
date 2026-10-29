(function(root){
  'use strict';
  const $=id=>document.getElementById(id),M=()=>root.CouncilRegisterModel,fmt=n=>new Intl.NumberFormat('pt-BR').format(n),pct=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(n)+'%';
  const colors={I:'#2563eb',II:'#7c3aed',III:'#087f8c',IV:'#d87320'};
  const pointsKey='pa-public-council-school-points-2023-v1';
  const aliasesKey='pa-public-council-school-references-2023-v1';
  let data,tab='results',ready=false,registerPage=0,history,historyPending,geo,geoPending,points={},selectedPoint='',storageError=false,aliases={},aliasRecord=null;
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const option=(v,t)=>new Option(t,v),unlocked=()=>!!root.CrmWorkspace?.isUnlocked?.();
  const context=()=>({council:$('ct-council').value,pole:$('ct-reg-pole').value,status:$('ct-reg-status').value,search:$('ct-reg-search').value});
  const download=(rows,name)=>{const quote=v=>{const text=String(v??''),safe=/^[=+@-]/.test(text)&&!/^-[0-9]+(?:[.,][0-9]+)?$/.test(text)?"'"+text:text;return '"'+safe.replace(/"/g,'""')+'"';},url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  function publicIndicators(){
    const rows=root.CouncilModel.competition(data,$('ct-council').value),body=$('ct-competition-rows');body.replaceChildren();
    for(const r of rows){const tr=node('tr');for(const text of ['CT '+r.council,fmt(r.topFiveVotes)+' · '+pct(r.topFiveShare),r.fifth.name+' · '+fmt(r.fifth.votes),r.sixth.name+' · '+fmt(r.sixth.votes),fmt(r.gap)+' votos'])tr.append(node('td',text));body.append(tr);}
  }
  function clearPrivate(){
    root.ReportCenter?.clearPrivate?.();
    $('ct-reg-private').hidden=true;$('ct-reg-locked').hidden=false;
    for(const id of ['ct-reg-total','ct-reg-matched','ct-reg-review','ct-reg-unmatched','ct-reg-outside','ct-reg-count','ct-reg-page','ct-reg-note'])$(id).textContent='';
    for(const id of ['ct-reg-rows','ct-reg-poles'])$(id).replaceChildren();
    $('ct-reg-search').value='';$('ct-reg-status').value='';$('ct-reg-pole').value='';registerPage=0;
    aliasRecord=null;$('ct-reg-alias-panel').hidden=true;$('ct-reg-alias-form').reset();$('ct-reg-alias-message').textContent='';
  }
  function analysis(){
    if(!unlocked()||typeof root.CrmWorkspace?.getRecords!=='function')return null;
    return M().analyze(data,root.CrmWorkspace.getRecords(),aliases);
  }
  function registerSignature(){
    const value=analysis();return value?JSON.stringify([context(),value.active,value.duplicates,value.rows.map(r=>[r.recordId,r.name,r.zone,r.section,r.school,r.municipality,r.status,r.poleId,r.reason,r.sourceRecords])]):'locked';
  }
  function fillRegisterPoles(){const old=$('ct-reg-pole').value,rows=data.poles.filter(p=>!$('ct-council').value||p.council===$('ct-council').value);$('ct-reg-pole').replaceChildren(option('','Todos os polos'),...rows.map(p=>option(p.id,'CT '+p.council+' · '+p.number+' — '+p.name)));$('ct-reg-pole').value=rows.some(p=>p.id===old)?old:'';}
  function renderRegisters(){
    if(!data)return;
    if(!unlocked()){clearPrivate();return;}
    const value=analysis();if(!value){clearPrivate();return;}
    $('ct-reg-private').hidden=false;$('ct-reg-locked').hidden=true;
    const f=context(),territory=M().select(value,{council:f.council,pole:f.pole}),counts=M().summary(territory),rows=M().select(value,f),totalPages=Math.max(1,Math.ceil(rows.length/20));registerPage=Math.min(registerPage,totalPages-1);
    $('ct-reg-total').textContent=fmt(territory.length);
    for(const status of ['matched','review','unmatched','outside'])$('ct-reg-'+status).textContent=fmt(counts[status])+(territory.length?' · '+pct(counts[status]/territory.length*100):'');
    const noCouncil=value.rows.filter(r=>!r.council&&!r.suggestions.length).length;
    $('ct-reg-note').textContent=fmt(value.active)+' registros ativos autorizados; '+fmt(value.total)+' no quadro após agrupar '+fmt(value.duplicates)+' repetição(ões) com título válido. '+(f.council?fmt(noCouncil)+' sem conselho/polo identificado na base; consulte Todos os conselhos para revisá-los.':'Registros sem título válido permanecem individualizados.');
    $('ct-reg-count').textContent=fmt(rows.length)+' cadastro(s) no filtro. Os indicadores acima consideram o conselho e polo, antes da busca e situação.';
    const body=$('ct-reg-rows');body.replaceChildren();
    for(const r of rows.slice(registerPage*20,(registerPage+1)*20)){
      const tr=node('tr'),name=node('td'),button=node('button',r.name,'ct-name-button');button.type='button';button.dataset.ctReviewRecord=r.recordId;name.append(button,node('small',r.registrationReady?'Cadastro com dados principais OK':'Cadastro com pendência principal','ct-reason'));if(r.sourceRecords>1)name.append(node('small',fmt(r.sourceRecords)+' registros agrupados','ct-reason'));
      const state=node('td'),badge=node('span',r.method==='manual-school-reference'?'Referência conferida manualmente':M().labels[r.status],'ct-link-status');badge.dataset.status=r.status;state.append(badge,node('small',r.reason,'ct-reason'));
      if(r.school&&r.section&&r.status!=='outside'){const review=node('button','Conferir escola de referência','ct-name-button');review.type='button';review.dataset.ctReviewSchool=r.recordId;state.append(review);}
      const pole=data.poles.find(p=>p.id===r.poleId),location=node('td',pole?'CT '+pole.council+' · Polo '+pole.number+' — '+pole.name:'A conferir');
      if(r.suggestions.length)location.append(node('small','Referências para conferir: '+r.suggestions.map(id=>{const p=data.poles.find(p=>p.id===id);return 'CT '+p.council+' / '+p.number;}).join(', '),'ct-reason'));
      tr.append(name,node('td',(r.zone||'—')+' / '+(r.section||'—')),node('td',r.school||'Local não confirmado'),location,state);body.append(tr);
    }
    if(!rows.length){const tr=node('tr'),td=node('td','Nenhum cadastro neste filtro.');td.colSpan=5;tr.append(td);body.append(tr);}
    $('ct-reg-page').textContent='Página '+(registerPage+1)+' de '+totalPages;$('ct-reg-prev').disabled=registerPage===0;$('ct-reg-next').disabled=registerPage+1>=totalPages;
    const poles=M().byPole(data,territory).filter(p=>!f.council||p.council===f.council).filter(p=>!f.pole||p.id===f.pole),poleBody=$('ct-reg-poles');poleBody.replaceChildren();
    for(const p of poles){const tr=node('tr'),label=node('td'),button=node('button','CT '+p.council+' · '+p.number+' — '+p.name,'ct-name-button');button.type='button';button.dataset.ctRegisterPole=p.id;label.append(button);tr.append(label,node('td',fmt(p.count),'ct-number'));poleBody.append(tr);}
  }
  function privateReport(){
    const value=analysis();if(!value){$('ct-reg-access-note').textContent='Abra a base de cadastros com sua senha para preparar este relatório.';return;}
    const prepare=kind=>{const current=analysis();if(!current)throw Error('A base foi bloqueada. Abra-a novamente.');return {report:M().report(data,current,context(),kind),filename:'Cadastros_Polos_Ananindeua_2023_'+kind+'.pdf'};};
    root.ReportCenter.open({private:true,signature:registerSignature,defaultType:'summary',options:[{id:'summary',label:'Resumo territorial de uma página A4',description:'Totais do filtro, situação dos vínculos e os cinco polos com mais correspondências. Sem nomes.',singlePage:true,prepare:()=>prepare('summary')},{id:'poles',label:'Todos os polos do filtro',description:'Preserva todos os polos encontrados e os totais de correspondências.',prepare:()=>prepare('poles'),prepareSummary:()=>prepare('summary')},{id:'pending',label:'Pendências de associação territorial',description:'Listagem nominal das pendências encontradas no filtro. Confira a prévia; a quantidade de páginas depende da seleção.',prepare:()=>prepare('pending')}]});
  }
  function reviewSchool(id){
    const value=analysis();if(!value)return;const row=value.rows.find(r=>r.recordId===id);if(!row||!row.school)return;
    aliasRecord={recordId:id,school:row.school,section:row.section};$('ct-reg-alias-panel').hidden=false;$('ct-reg-alias-current').value=row.school;$('ct-reg-alias-section').value=row.section;$('ct-reg-alias-confirm').checked=false;
    $('ct-reg-alias-source').replaceChildren(option('','Escolha a escola na relação de 2023'),...data.associated.map((s,i)=>option(String(i),'CT '+s.council+' · Polo '+s.poleId.split(':')[1]+' — '+s.name)));
    const alias=aliases[M().schoolKey(row.school)],chosen=alias?data.associated.findIndex(s=>s.poleId===alias.poleId&&s.name===alias.sourceSchool):-1;$('ct-reg-alias-source').value=chosen>=0?String(chosen):'';
    $('ct-reg-alias-panel').scrollIntoView?.({behavior:'smooth',block:'nearest'});checkSchoolReference();
  }
  function checkSchoolReference(){
    const selected=$('ct-reg-alias-source').value,source=selected!==''?data.associated[Number(selected)]:null,section=aliasRecord?.section;
    $('ct-reg-alias-link').href=data.sources.schools.url+(source?'#page='+source.page:'');$('ct-reg-alias-confirm').checked=false;
    const allowed=source&&M().sectionSet(source.sections).has(section);$('ct-reg-alias-save').disabled=!allowed;
    $('ct-reg-alias-message').textContent=!source?'Escolha a escola histórica e consulte a publicação.':allowed?'A seção '+section+' consta nesta escola. Confirme documentalmente que os dois nomes correspondem ao mesmo estabelecimento.':'A seção '+section+' não consta nesta escola em 2023. O vínculo continuará pendente; é necessário conferir a mudança histórica.';
  }
  function saveSchoolReference(event){
    event.preventDefault();if(!unlocked()||!aliasRecord)return;
    const current=analysis()?.rows.find(r=>r.recordId===aliasRecord.recordId),selected=$('ct-reg-alias-source').value,source=selected!==''?data.associated[Number(selected)]:null;
    if(!current||current.school!==aliasRecord.school||current.section!==aliasRecord.section){$('ct-reg-alias-message').textContent='O cadastro mudou. Abra a conferência novamente.';return;}
    if(!source||!M().sectionSet(source.sections).has(current.section)||!$('ct-reg-alias-confirm').checked){$('ct-reg-alias-message').textContent='Consulte a fonte e confirme a mesma escola e seção antes de salvar.';return;}
    const value={year:2023,currentSchool:current.school,sourceSchool:source.name,poleId:source.poleId,source:data.sources.schools.url,checkedAt:new Date().toISOString(),confirmed:true},next={...aliases,[M().schoolKey(current.school)]:value};
    try{localStorage.setItem(aliasesKey,JSON.stringify(next));aliases=next;renderRegisters();$('ct-reg-alias-message').textContent='Correspondência de nomes salva neste aparelho. O cadastro original foi preservado.';}catch{$('ct-reg-alias-message').textContent='Não foi possível salvar a correspondência neste navegador.';}
  }
  function privateCSV(){const value=analysis();if(!value){$('ct-reg-access-note').textContent='Abra a base com sua senha para exportar o resumo territorial.';return;}const rows=M().select(value,context()),counts=M().summary(rows),poles=M().byPole(data,rows).filter(p=>p.count);download([['Referência','Conselho','Polo','Escola polo','Cadastros com correspondência'],...poles.map(p=>[2023,p.council,p.number,p.name,p.count]),[],['Situação do filtro','Quantidade'],...Object.entries(counts).map(([key,n])=>[M().labels[key],n])],'Cadastros_Polos_Ananindeua_2023_resumo.csv');}
  function exportCSV(kind){
    if(kind==='registers')return privateCSV();
    if(kind==='map'){$('ct-geo-export').click();return;}
    if(kind==='history'&&history){const current=root.CouncilModel.scope(data).reported;download([['Indicador municipal','2019','2023'],['Votos válidos',history.valid,current.valid],['Brancos',history.blank,current.blank],['Nulos',history.null,current.null],['Anulados','Não informado',current.annulled],['Comparecimento','Não informado',current.attendance],['Fonte 2019',history.source.url],['Fonte 2023',data.sources.results.url]],'Conselho_Tutelar_Ananindeua_2019_2023.csv');}
  }
  function mapReport(){
    if(!data)return;const filters={council:$('ct-council').value,schoolSearch:$('ct-geo-search').value};
    root.ReportCenter.open({signature:()=>JSON.stringify([$('ct-council').value,$('ct-geo-search').value]),defaultType:'schools',defaultFormat:'compact',options:[{id:'schools',label:'Escolas do recorte do mapa',description:'Relação completa das escolas polo e endereços encontrados na busca do mapa.',prepare:()=>({report:root.CouncilModel.report(data,filters,'schools'),filename:'Polos_Ananindeua_2023_mapa_escolas.pdf'})}]});
  }
  async function loadHistory(){
    if(history){renderHistory();return;}if(historyPending)return historyPending;
    historyPending=(async()=>{try{const r=await fetch('/council-data/ananindeua-2019-summary.json',{credentials:'same-origin'});if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('Histórico indisponível. Conecte ou prepare este aparelho para uso offline.');const value=await r.json();if(value.year!==2019||value.municipality!=='Ananindeua'||value.valid!==22413)throw Error('A referência histórica não passou pela conferência.');history=value;renderHistory();}catch(e){$('ct-history-status').textContent=e.message;historyPending=null;}})();return historyPending;
  }
  function renderHistory(){
    const current=root.CouncilModel.scope(data).reported,difference=current.valid-history.valid;
    $('ct-history-status').textContent='Comparação dos totais municipais publicados. O filtro de conselho não se aplica a este quadro.';
    $('ct-history-old').textContent=fmt(history.valid);$('ct-history-current').textContent=fmt(current.valid);$('ct-history-change').textContent='+'+fmt(difference)+' votos · +'+pct(difference/history.valid*100);
    $('ct-history-rows').replaceChildren();
    for(const [label,old,currentValue] of [['Votos válidos',history.valid,current.valid],['Brancos',history.blank,current.blank],['Nulos',history.null,current.null],['Anulados',history.annulled,current.annulled],['Comparecimento',history.attendance,current.attendance]]){const tr=node('tr');tr.append(node('td',label),node('td',old===null?'Não informado':fmt(old),'ct-number'),node('td',fmt(currentValue),'ct-number'));$('ct-history-rows').append(tr);}
    $('ct-history-output').hidden=false;$('ct-history-pdf').disabled=false;
  }
  function historyReport(){if(!history)return;root.ReportCenter.open({signature:()=>JSON.stringify([history.valid,root.CouncilModel.scope(data).reported.valid]),defaultType:'summary',options:[{id:'summary',singlePage:true,label:'Histórico municipal A4',description:'Totais oficiais de 2019 e 2023. Sem atribuir correspondência individual entre candidaturas.',prepare:()=>({filename:'Conselho_Tutelar_Ananindeua_2019_2023.pdf',report:{layout:'single-page-summary',electionYear:2023,headerSubtitle:'Conselho Tutelar · histórico municipal',title:'Ananindeua — totais publicados em 2019 e 2023',subtitle:'Comparação dos votos válidos de todo o município.',meta:[['2019',history.source.title],['2023',data.sources.results.title]],indicators:[{label:'Válidos 2019',value:fmt(history.valid)},{label:'Válidos 2023',value:$('ct-history-current').textContent},{label:'Diferença em votos e %',value:$('ct-history-change').textContent}],summaryChart:{title:'Votos válidos publicados',rows:[{label:'2019',values:[{label:'Votos',value:history.valid,color:'#7c3aed'}]},{label:'2023',values:[{label:'Votos',value:root.CouncilModel.scope(data).reported.valid,color:'#2563eb'}]}]},blocks:[],sources:[history.source.url,data.sources.results.url],note:'2019: não informado equivale a dado ausente, e não a zero. Em 2023, a soma das candidaturas do Conselho II diverge em 5 votos do total publicado. Comparação municipal, sem certificar equivalência de áreas dos conselhos ou identidade entre candidaturas.',finalResult:{title:'Diferença dos totais publicados',summary:$('ct-history-change').textContent}}})}]});}
  function pointInPolygon(point,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
  function validPoint(p){if(!geo||!p||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||p.confirmed!==true)return false;const geometry=geo.geometry,polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;return polygons.some(polygon=>pointInPolygon([p.longitude,p.latitude],polygon[0])&&!polygon.slice(1).some(r=>pointInPolygon([p.longitude,p.latitude],r)));}
  function mapLink(p){return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.name+', '+p.address+', Ananindeua, Pará');}
  function drawMap(){
    if(!geo)return;const ns='http://www.w3.org/2000/svg',svg=$('ct-geo-svg'),rings=(geo.geometry.type==='Polygon'?[geo.geometry.coordinates]:geo.geometry.coordinates).flat(),coordinates=rings.flat(),xs=coordinates.map(p=>p[0]),ys=coordinates.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),scale=Math.min(640/(maxX-minX),420/(maxY-minY)),x=lon=>40+(lon-minX)*scale,y=lat=>35+(maxY-lat)*scale;
    svg.replaceChildren();svg.setAttribute('viewBox','0 0 720 500');
    const path=document.createElementNS(ns,'path');path.setAttribute('d',rings.map(ring=>'M'+ring.map(p=>x(p[0])+','+y(p[1])).join('L')+'Z').join(' '));path.setAttribute('fill','#e0ebff');path.setAttribute('stroke','#84a3d2');path.setAttribute('stroke-width','1.2');svg.append(path);
    const visible=data.poles.filter(p=>!$('ct-council').value||p.council===$('ct-council').value);let count=0;
    for(const p of visible){const coordinate=points[p.id];if(!validPoint(coordinate))continue;count++;const g=document.createElementNS(ns,'g'),circle=document.createElementNS(ns,'circle'),title=document.createElementNS(ns,'title');title.textContent='CT '+p.council+' / '+p.number+' — '+p.name;g.dataset.ctGeoPole=p.id;g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('aria-label',title.textContent);circle.setAttribute('cx',x(coordinate.longitude));circle.setAttribute('cy',y(coordinate.latitude));circle.setAttribute('r',p.id===selectedPoint?'9':'6');circle.setAttribute('fill',colors[p.council]);circle.setAttribute('stroke','#fff');circle.setAttribute('stroke-width','2');g.append(circle,title);svg.append(g);}
    $('ct-geo-status').textContent=fmt(count)+' de '+visible.length+' polos do recorte com ponto conferido neste aparelho. '+(count?'Selecione um ponto ou a escola na lista.':'Use a consulta por endereço e confira as coordenadas para acrescentar os pontos.');
  }
  function choosePoint(id){
    selectedPoint=id;const p=data.poles.find(p=>p.id===id);if(!p)return;const point=points[id];$('ct-geo-name').textContent='CT '+p.council+' · Polo '+p.number+' — '+p.name;$('ct-geo-address').textContent=p.address;$('ct-geo-link').href=mapLink(p);
    $('ct-geo-lat').value=point?.latitude??'';$('ct-geo-lon').value=point?.longitude??'';$('ct-geo-source').value=point?.source||'';$('ct-geo-confirm').checked=!!point?.confirmed;$('ct-geo-detail').hidden=false;$('ct-geo-save-note').textContent='As coordenadas conferidas ficam neste aparelho. Exporte os pontos para levá-los a outro dispositivo.';drawMap();
  }
  function renderMap(){
    if(!data)return;
    const list=$('ct-geo-list'),query=M().normalize($('ct-geo-search').value),rows=data.poles.filter(p=>(!$('ct-council').value||p.council===$('ct-council').value)&&(!query||M().normalize(p.name+' '+p.address+' '+p.number).includes(query)));list.replaceChildren();
    if(selectedPoint&&!rows.some(p=>p.id===selectedPoint)){selectedPoint='';$('ct-geo-detail').hidden=true;$('ct-geo-form').reset();}
    for(const p of rows){const button=node('button',undefined,'ct-geo-school');button.type='button';button.dataset.ctGeoPole=p.id;button.append(node('strong','CT '+p.council+' · '+p.number+' — '+p.name),node('small',p.address),node('span',validPoint(points[p.id])?'Ponto conferido neste aparelho':'Coordenada a conferir'));list.append(button);}drawMap();
  }
  async function loadMap(){
    if(geo){renderMap();return;}if(geoPending)return geoPending;
    geoPending=(async()=>{try{const r=await fetch('/pa-municipal-map.json',{credentials:'same-origin'});if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('Mapa indisponível. Conecte ou prepare este aparelho para uso offline.');const map=await r.json();geo=map.features.find(f=>String(f.properties.code)==='4154');if(!geo)throw Error('Mapa de Ananindeua não encontrado.');renderMap();}catch(e){$('ct-geo-status').textContent=e.message;geoPending=null;}})();return geoPending;
  }
  function savePoint(event){
    event.preventDefault();if(!selectedPoint)return;
    const parse=s=>String(s).trim()?Number(String(s).trim().replace(',','.')):NaN,point={latitude:parse($('ct-geo-lat').value),longitude:parse($('ct-geo-lon').value),source:$('ct-geo-source').value.trim(),confirmed:$('ct-geo-confirm').checked,checkedAt:new Date().toISOString()};
    if(!point.confirmed||!point.source||!validPoint(point)){$('ct-geo-save-note').textContent='Informe coordenadas dentro de Ananindeua, a fonte consultada e confirme a conferência da escola.';return;}
    const next={...points,[selectedPoint]:point};try{localStorage.setItem(pointsKey,JSON.stringify(next));points=next;storageError=false;renderMap();$('ct-geo-save-note').textContent='Ponto conferido salvo neste aparelho.';}catch{$('ct-geo-save-note').textContent='Não foi possível salvar neste navegador. Os pontos anteriores foram preservados.';}
  }
  function init(){
    if(ready)return;ready=true;
    try{const stored=JSON.parse(localStorage.getItem(pointsKey)||'{}');if(stored&&typeof stored==='object'&&!Array.isArray(stored))points=stored;}catch{storageError=true;}
    try{const stored=JSON.parse(localStorage.getItem(aliasesKey)||'{}');if(stored&&typeof stored==='object'&&!Array.isArray(stored))aliases=stored;}catch{}
    for(const id of ['ct-reg-pole','ct-reg-status','ct-reg-search'])$(id).addEventListener(id==='ct-reg-search'?'input':'change',()=>{registerPage=0;renderRegisters();});
    $('ct-reg-prev').addEventListener('click',()=>{registerPage--;renderRegisters();});$('ct-reg-next').addEventListener('click',()=>{registerPage++;renderRegisters();});
    $('ct-reg-clear').addEventListener('click',()=>{$('ct-reg-pole').value='';$('ct-reg-status').value='';$('ct-reg-search').value='';registerPage=0;renderRegisters();});
    $('ct-reg-panel').addEventListener('click',event=>{const status=event.target.closest?.('[data-ct-register-status]'),pole=event.target.closest?.('[data-ct-register-pole]'),record=event.target.closest?.('[data-ct-review-record]'),school=event.target.closest?.('[data-ct-review-school]');if(status){$('ct-reg-status').value=status.dataset.ctRegisterStatus;registerPage=0;renderRegisters();}if(pole){$('ct-reg-pole').value=pole.dataset.ctRegisterPole;$('ct-reg-status').value='';registerPage=0;renderRegisters();}if(record)root.CrmWorkspace?.openCouncilRecord?.(record.dataset.ctReviewRecord);if(school)reviewSchool(school.dataset.ctReviewSchool);});
    $('ct-reg-alias-source').addEventListener('change',checkSchoolReference);$('ct-reg-alias-form').addEventListener('submit',saveSchoolReference);$('ct-reg-alias-close').addEventListener('click',()=>{aliasRecord=null;$('ct-reg-alias-panel').hidden=true;$('ct-reg-alias-form').reset();});
    $('ct-reg-alias-remove').addEventListener('click',()=>{if(!unlocked()||!aliasRecord)return;const next={...aliases};delete next[M().schoolKey(aliasRecord.school)];try{localStorage.setItem(aliasesKey,JSON.stringify(next));aliases=next;renderRegisters();$('ct-reg-alias-message').textContent='Correspondência manual removida. A conferência documental automática continua ativa.';}catch{$('ct-reg-alias-message').textContent='Não foi possível remover a correspondência neste navegador.';}});
    $('ct-reg-alias-export').addEventListener('click',()=>{if(!unlocked())return;const url=URL.createObjectURL(new Blob([JSON.stringify({type:'council-school-references',year:2023,aliases},null,2)],{type:'application/json'})),a=node('a');a.href=url;a.download='Escolas_Ananindeua_2023_correspondencias.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    $('ct-reg-alias-import').addEventListener('change',async event=>{try{if(!unlocked())return;const file=event.target.files?.[0];if(!file)return;if(file.size>100000)throw Error('Arquivo muito grande.');const value=JSON.parse(await file.text());if(!unlocked())return;if(value.type!=='council-school-references'||value.year!==2023||!value.aliases||Array.isArray(value.aliases))throw Error('Arquivo de correspondências incompatível.');const next={...aliases};for(const [key,a] of Object.entries(value.aliases)){if(!a||typeof a!=='object'||a.year!==2023||a.confirmed!==true||typeof a.currentSchool!=='string'||a.currentSchool.length>300||key!==M().schoolKey(a.currentSchool)||!data.associated.some(s=>s.name===a.sourceSchool&&s.poleId===a.poleId))throw Error('Há uma escola de referência inválida. A cópia anterior foi preservada.');next[key]={year:2023,currentSchool:a.currentSchool,sourceSchool:a.sourceSchool,poleId:a.poleId,source:data.sources.schools.url,confirmed:true,checkedAt:typeof a.checkedAt==='string'?a.checkedAt:new Date().toISOString()};}localStorage.setItem(aliasesKey,JSON.stringify(next));aliases=next;renderRegisters();$('ct-reg-transfer-note').textContent='Correspondências de escolas importadas neste aparelho.';}catch(e){$('ct-reg-transfer-note').textContent=e.message;}finally{event.target.value='';}});
    document.addEventListener('crm:state-change',()=>{if(!unlocked())clearPrivate();else if(tab==='registers')renderRegisters();});root.addEventListener('pagehide',clearPrivate);
    $('ct-history-pdf').addEventListener('click',historyReport);$('ct-history-retry').addEventListener('click',loadHistory);
    $('ct-geo-search').addEventListener('input',renderMap);$('ct-geo-form').addEventListener('submit',savePoint);
    for(const id of ['ct-geo-lat','ct-geo-lon','ct-geo-source'])$(id).addEventListener('input',()=>{$('ct-geo-confirm').checked=false;});
    const pick=event=>{const target=event.target.closest?.('[data-ct-geo-pole]');if(target)choosePoint(target.dataset.ctGeoPole);};$('ct-geo-list').addEventListener('click',pick);$('ct-geo-svg').addEventListener('click',pick);$('ct-geo-svg').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();pick(event);}});
    $('ct-geo-export').addEventListener('click',()=>{const query=M().normalize($('ct-geo-search').value),rows=data.poles.filter(p=>validPoint(points[p.id])&&(!$('ct-council').value||p.council===$('ct-council').value)&&(!query||M().normalize(p.name+' '+p.address+' '+p.number).includes(query)));download([['Referência','Conselho','Polo','Escola','Latitude','Longitude','Fonte da coordenada','Conferido em'],...rows.map(p=>[2023,p.council,p.number,p.name,points[p.id].latitude.toLocaleString('pt-BR',{maximumFractionDigits:6}),points[p.id].longitude.toLocaleString('pt-BR',{maximumFractionDigits:6}),points[p.id].source,points[p.id].checkedAt])],'Polos_Ananindeua_2023_coordenadas.csv');});
    $('ct-geo-import').addEventListener('change',async event=>{try{const file=event.target.files?.[0];if(!file)return;if(file.size>100000)throw Error('Arquivo muito grande. Use o JSON de pontos exportado.');const value=JSON.parse(await file.text());if(value.year!==2023||value.type!=='council-school-points'||!value.points||Array.isArray(value.points))throw Error('Arquivo de pontos incompatível.');const next={...points};for(const [id,p] of Object.entries(value.points)){if(!data.poles.some(s=>s.id===id)||!validPoint(p)||typeof p.source!=='string'||!p.source.trim())throw Error('Há escola ou coordenada inválida. A cópia anterior foi preservada.');next[id]=p;}localStorage.setItem(pointsKey,JSON.stringify(next));points=next;renderMap();$('ct-geo-import-note').textContent='Pontos conferidos importados neste aparelho.';}catch(e){$('ct-geo-import-note').textContent=e.message;}finally{event.target.value='';}});
    $('ct-geo-json').addEventListener('click',()=>{const valid=Object.fromEntries(Object.entries(points).filter(([id,p])=>data.poles.some(s=>s.id===id)&&validPoint(p))),url=URL.createObjectURL(new Blob([JSON.stringify({type:'council-school-points',year:2023,points:valid},null,2)],{type:'application/json'})),a=node('a');a.href=url;a.download='Polos_Ananindeua_2023_pontos.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    clearPrivate();
  }
  function update(value,currentTab){data=value;tab=currentTab;publicIndicators();fillRegisterPoles();if(tab==='registers')renderRegisters();if(tab==='history')loadHistory();if(tab==='map')loadMap();if(storageError)$('ct-geo-import-note').textContent='Não foi possível ler pontos salvos neste navegador. Consulte as escolas por endereço.';}
  root.CouncilExtras={init,update,privateReport,historyReport,mapReport,exportCSV};
})(window);
