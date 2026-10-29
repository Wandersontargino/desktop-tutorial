(function(root){
  'use strict';
  const mounted=new WeakMap(),normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  function render(target,{options,selected=[],onApply}){
    if(!target)return;
    const byKey=new Map(options.map(o=>[o.value,o]));
    selected=[...new Set(selected)];
    for(const value of selected)if(!byKey.has(value))byKey.set(value,{value,label:value+' • indisponível na base atual'});
    const rows=[...byKey.values()].sort((a,b)=>a.label.localeCompare(b.label,'pt-BR'));
    const signature=JSON.stringify([rows,selected]),previous=mounted.get(target);
    if(previous?.signature===signature){previous.onApply=onApply;return;}
    const context={signature,onApply};mounted.set(target,context);
    let draft=new Set(selected),limit=80;
    const make=(tag,text,cls)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
    const detail=make('details',null,'data-details school-picker'),summary=make('summary',selected.length?`Editar seleção de ${selected.length} escolas`:'Selecionar várias escolas manualmente');
    const content=make('div',null,'school-picker-content'),label=make('label',null,'field'),search=make('input');search.type='search';search.placeholder='Nome da escola ou município';search.autocomplete='off';label.append(make('span','Buscar escolas para marcar'),search);
    const count=make('p',null,'compact-note');count.setAttribute('role','status');count.setAttribute('aria-live','polite');
    const controls=make('div',null,'button-row'),mark=make('button','Marcar resultados da busca','button secondary'),clear=make('button','Limpar marcações','button secondary');
    const fieldset=make('fieldset',null,'school-picker-options'),legend=make('legend','Locais de votação disponíveis','sr-only'),list=make('div'),more=make('button','Ver mais locais','button secondary'),apply=make('button','Aplicar seleção','button primary'),note=make('p','Marque as escolas desejadas e aplique para somar os votos. Sem marcações, a consulta abrange todos os locais do recorte.','compact-note');
    for(const b of [mark,clear,more,apply])b.type='button';
    const matches=()=>rows.filter(o=>normalize(o.label).includes(normalize(search.value)));
    function draw(){
      const matched=matches();list.replaceChildren();
      for(const row of matched.slice(0,limit)){
        const choice=make('label',null,'municipality-choice'),input=make('input');input.type='checkbox';input.value=row.value;input.checked=draft.has(row.value);input.addEventListener('change',()=>{input.checked?draft.add(row.value):draft.delete(row.value);updateCount();});choice.append(input,make('span',row.label));list.append(choice);
      }
      if(!matched.length)list.append(make('p','Nenhum local encontrado. Tente outra parte do nome.','compact-note'));
      more.hidden=matched.length<=limit;more.textContent=`Ver mais locais (${Math.min(limit,matched.length)} de ${matched.length})`;mark.disabled=!matched.length;clear.disabled=!draft.size;updateCount();
    }
    function updateCount(){count.textContent=`${draft.size} escola(s) marcada(s) • ${matches().length} local(is) na busca. As marcações permanecem ao mudar a busca.`;clear.disabled=!draft.size;}
    search.addEventListener('input',()=>{limit=80;draw();});mark.addEventListener('click',()=>{matches().forEach(o=>draft.add(o.value));draw();});clear.addEventListener('click',()=>{draft.clear();draw();});more.addEventListener('click',()=>{limit+=80;draw();});
    apply.addEventListener('click',()=>{const selected=rows.filter(o=>draft.has(o.value)).map(o=>o.value);detail.open=false;context.onApply(selected);});
    controls.append(mark,clear);fieldset.append(legend,list);content.append(label,count,controls,fieldset,more,note,apply);detail.append(summary,content);target.replaceChildren(detail);draw();
  }
  function summary(target,rows,selected,total){
    if(!target)return;target.replaceChildren();target.hidden=!selected.length;if(!selected.length)return;
    const title=document.createElement('h4');title.textContent=`${selected.length} escola(s) selecionada(s) • ${new Intl.NumberFormat('pt-BR').format(total)} votos no filtro`;
    const wrap=document.createElement('div');wrap.className='table-wrap';const table=document.createElement('table'),head=document.createElement('thead'),heading=document.createElement('tr'),body=document.createElement('tbody');
    for(const text of ['Escola / município','Votos no filtro']){const th=document.createElement('th');th.textContent=text;th.scope='col';heading.append(th);}head.append(heading);
    const values=new Map(rows.map(r=>[r.value,r]));
    let visible=100;const more=document.createElement('button');more.type='button';more.className='button secondary';
    function draw(){body.replaceChildren();for(const key of selected.slice(0,visible)){const item=values.get(key),tr=document.createElement('tr'),name=document.createElement('td'),votes=document.createElement('td');name.textContent=item?.label||key;votes.textContent=new Intl.NumberFormat('pt-BR').format(item?.votes||0);tr.append(name,votes);body.append(tr);}more.hidden=visible>=selected.length;more.textContent=`Ver mais escolas (${Math.min(visible,selected.length)} de ${selected.length})`;}
    more.addEventListener('click',()=>{visible+=100;draw();});draw();
    table.append(head,body);wrap.append(table);target.append(title,wrap,more);
  }
  root.SchoolPicker={render,summary};
})(window);
