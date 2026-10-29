(function(root){
  'use strict';
  const $=id=>document.getElementById(id),int=v=>new Intl.NumberFormat('pt-BR').format(v);
  const pct=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(v)+'%';
  const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const name=s=>s.ballotName||s.candidate[2];
  let input=null,chart=null,focus='',page=0,sort='gap',signature='',initialized=false;
  const pageSize=12;
  function ordered(){return [...input.municipalities].sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'pt-BR'):sort==='volume'?b.values.reduce((n,v)=>n+v,0)-a.values.reduce((n,v)=>n+v,0):Math.abs((b.values[0]||0)-(b.values[1]||0))-Math.abs((a.values[0]||0)-(a.values[1]||0))||a.name.localeCompare(b.name,'pt-BR'));}
  function growth(current,previous){
    if(previous==null)return {label:'Sem histórico',tone:''};
    const delta=current-previous;
    return {label:(delta>0?'+':'')+int(delta)+' votos'+(previous>0?' · '+(delta>0?'+':'')+pct(delta/previous*100):delta>0?' · base 2022 zero':''),tone:delta>0?'trend-up':delta<0?'trend-down':''};
  }
  function renderMatrix(){
    const target=$('comparison-matrix');if(!target||!input)return;
    const ready=input.selections.length===2;
    $('comparison-matrix-controls').hidden=!ready;
    $('comparison-matrix-head').hidden=!ready;
    $('comparison-matrix-pagination').hidden=!ready;
    if(!ready){target.replaceChildren(node('p','Selecione dois candidatos do mesmo cargo para comparar os municípios.','compact-note'));$('comparison-focus-select').disabled=true;return;}
    const rows=ordered(),pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages-1);
    for(let i=0;i<2;i++)$('comparison-matrix-candidate-'+i).textContent=input.selections[i].candidate[1];
    const fragment=document.createDocumentFragment();
    rows.slice(page*pageSize,(page+1)*pageSize).forEach(row=>{
      const button=node('button',undefined,'comparison-matrix-row');button.type='button';button.dataset.comparisonCity=row.code;button.setAttribute('aria-pressed',String(row.code===focus));
      const city=node('span',undefined,'comparison-matrix-city');city.append(node('strong',row.name),node('small',row.region));button.append(city);
      input.selections.forEach((selection,i)=>{
        const value=row.values[i],share=row.nominal>0?value/row.nominal*100:null;
        const cell=node('span',undefined,'comparison-heat-cell');cell.style.setProperty('--matrix-color',selection.color);cell.style.setProperty('--matrix-intensity',share==null?'0%':Math.min(28,8+share*.5)+'%');
        cell.append(node('strong',share==null?'—':pct(share)),node('small',int(value)+' votos'));button.append(cell);
      });
      const delta=row.values[0]-row.values[1],gap=node('span',undefined,'comparison-matrix-gap');gap.append(node('strong',int(Math.abs(delta))),node('small',delta===0?'Empate':'para '+input.selections[delta>0?0:1].candidate[1]));button.append(gap);
      button.setAttribute('aria-label',row.name+': '+input.selections.map((s,i)=>name(s)+' '+int(row.values[i])+' votos').join('; ')+'. Detalhar zonas e locais.');fragment.append(button);
    });
    target.replaceChildren(fragment);
    $('comparison-matrix-count').textContent=rows.length?int(page*pageSize+1)+'–'+int(Math.min((page+1)*pageSize,rows.length))+' de '+int(rows.length)+' municípios':'Nenhum município no filtro';
    $('comparison-matrix-prev').disabled=page===0;$('comparison-matrix-next').disabled=page>=pages-1;
  }
  function matches(section){const f=input.filters||{};return (!f.zone||Number(section[0])===Number(f.zone))&&(!f.section||Number(section[1])===Number(f.section))&&(!f.place||normalize(section[2])===normalize(f.place))&&(!f.neighborhood||normalize(section[3])===normalize(f.neighborhood));}
  function focusRows(unit){
    const selections=input.selections,groups=new Map();
    const key=r=>unit==='zone'?String(Number(r.zone)):JSON.stringify([r.place,r.neighborhood]);
    const label=r=>unit==='zone'?'Zona '+String(Number(r.zone)).padStart(3,'0'):r.place||'Local não informado';
    for(const section of input.city.s||[]){if(String(section[4]||input.city.m[0])!==focus||!matches(section))continue;const r={zone:section[0],place:section[2],neighborhood:section[3]},id=key(r);if(!groups.has(id))groups.set(id,{key:id,label:label(r),neighborhood:r.neighborhood,values:selections.map(()=>0),previousValues:selections.map(()=>null)});}
    selections.forEach((s,i)=>{
      for(const row of s.rows||[]){if(String(row.municipalityCode)!==focus)continue;const id=key(row);if(!groups.has(id))groups.set(id,{key:id,label:label(row),values:selections.map(()=>0),previousValues:selections.map(()=>null)});groups.get(id).values[i]+=row.votes;}
      if(!s.previous||!Array.isArray(s.previousRows))return;
      for(const row of s.previousRows){if(String(row.municipalityCode)!==focus)continue;let id=key(row);if(unit==='place'){const candidates=[...groups.entries()].filter(([,g])=>normalize(g.label)===normalize(row.place));if(candidates.length!==1)continue;id=candidates[0][0];}if(groups.has(id)){const g=groups.get(id);g.previousValues[i]=(g.previousValues[i]??0)+row.votes;}}
    });
    return [...groups.values()].sort((a,b)=>unit==='zone'?Number(a.key)-Number(b.key):b.values.reduce((n,v)=>n+v,0)-a.values.reduce((n,v)=>n+v,0));
  }
  function renderFocus(){
    if(!input||!chart)return;
    const municipality=input.municipalities.find(r=>r.code===focus),ready=input.selections.length===2&&municipality;
    $('comparison-focus-title').textContent=ready?municipality.name:'Detalhe por município';
    $('comparison-focus-select').disabled=!ready;
    if(!ready){$('comparison-focus-metrics').replaceChildren();chart('comparison-zone-chart',[],input.selections);chart('comparison-place-chart',[],input.selections);$('comparison-zone-note').textContent='—';return;}
    $('comparison-focus-select').value=focus;
    const fragment=document.createDocumentFragment();
    input.selections.forEach((s,i)=>{const card=node('div',undefined,'comparison-focus-metric');card.style.setProperty('--candidate-color',s.color);const prior=growth(municipality.values[i],municipality.previousValues[i]);card.append(node('span',s.candidate[1]+' · '+name(s)),node('strong',int(municipality.values[i])+' votos'),node('small',prior.label,prior.tone));fragment.append(card);});
    $('comparison-focus-metrics').replaceChildren(fragment);
    const zones=focusRows('zone'),places=focusRows('place').filter(r=>r.values.some(v=>v>0));
    chart('comparison-zone-chart',zones.slice(0,12),input.selections);chart('comparison-place-chart',places.slice(0,10),input.selections);
    $('comparison-zone-note').textContent=int(zones.length)+' zona(s)'+(zones.length>12?' · primeiras 12 no gráfico':'')+' · votos por eleição';
    $('comparison-focus-place-title').textContent='Locais de votação · '+municipality.name;
  }
  function render(data,renderChart){
    input=data;chart=renderChart;
    const next=JSON.stringify([data.office,data.codes,data.selections.map(s=>s.candidate[0]),data.filters]);
    if(next!==signature){signature=next;page=0;focus='';}
    if(!data.municipalities.some(r=>r.code===focus))focus=ordered()[0]?.code||'';
    const select=$('comparison-focus-select');select.replaceChildren(...[...data.municipalities].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(r=>{const option=node('option',r.name);option.value=r.code;return option;}));
    renderMatrix();renderFocus();
  }
  function init(){
    if(initialized)return;initialized=true;
    $('comparison-matrix').addEventListener('click',event=>{const button=event.target.closest('[data-comparison-city]');if(!button)return;focus=button.dataset.comparisonCity;renderMatrix();renderFocus();});
    $('comparison-focus-select').addEventListener('change',event=>{focus=event.target.value;renderMatrix();renderFocus();});
    $('comparison-matrix-sort').addEventListener('change',event=>{sort=event.target.value;page=0;renderMatrix();});
    $('comparison-matrix-prev').addEventListener('click',()=>{page=Math.max(0,page-1);renderMatrix();});
    $('comparison-matrix-next').addEventListener('click',()=>{page++;renderMatrix();});
  }
  root.ComparisonTerritory={init,render};
})(window);
