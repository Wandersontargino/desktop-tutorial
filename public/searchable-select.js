(function(root){
  const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function attach(select){
    if(!select||select.dataset.searchable)return;select.dataset.searchable='true';
    const box=document.createElement('div');box.className='searchable-select';
    const input=document.createElement('input');input.id=select.id+'-search';input.type='search';input.autocomplete='off';input.placeholder=select.dataset.searchPlaceholder||'Digite parte do nome da escola';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
    if(select.getAttribute('aria-describedby'))input.setAttribute('aria-describedby',select.getAttribute('aria-describedby'));
    const list=document.createElement('div');list.id=select.id+'-suggestions';list.className='school-suggestions';list.setAttribute('role','listbox');list.hidden=true;input.setAttribute('aria-controls',list.id);
    input.setAttribute('aria-label',select.closest('label')?.querySelector('span')?.textContent||'Buscar local de votação');
    select.before(box);box.append(input,list);select.hidden=true;
    let options=[],cursor=-1;
    function choose(option){select.value=option.value;input.value=option.value?option.label:'';list.hidden=true;input.setAttribute('aria-expanded','false');select.dispatchEvent(new Event('change',{bubbles:true}));}
    function show(){
      const term=normalize(input.value);options=[...select.options].filter(o=>!o.disabled&&(!o.value||normalize(o.textContent).includes(term))).slice(0,40).map(o=>({value:o.value,label:o.textContent}));list.replaceChildren();cursor=-1;
      for(const [i,o]of options.entries()){const button=document.createElement('button');button.type='button';button.id=list.id+'-'+i;button.setAttribute('role','option');button.textContent=o.label;button.addEventListener('click',()=>choose(o));list.append(button);}
      if(options.length===1&&!options[0].value){const p=document.createElement('p');p.textContent='Nenhum local com esse nome. Tente outra parte do nome.';list.append(p);}
      list.hidden=false;input.setAttribute('aria-expanded','true');
    }
    input.addEventListener('focus',show);input.addEventListener('input',show);
    input.addEventListener('keydown',e=>{if(e.key==='Escape'){list.hidden=true;input.setAttribute('aria-expanded','false');}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if(list.hidden)show();cursor=Math.max(0,Math.min(options.length-1,cursor+(e.key==='ArrowDown'?1:-1)));input.setAttribute('aria-activedescendant',list.id+'-'+cursor);[...list.querySelectorAll('button')].forEach((b,i)=>b.setAttribute('aria-selected',String(i===cursor)));}if(e.key==='Enter'&&!list.hidden){e.preventDefault();if(cursor>=0)choose(options[cursor]);else{const exact=options.find(o=>normalize(o.label)===normalize(input.value));if(exact)choose(exact);else if(options.filter(o=>o.value).length===1)choose(options.find(o=>o.value));}}});
    document.addEventListener('pointerdown',e=>{if(!box.contains(e.target)){list.hidden=true;input.setAttribute('aria-expanded','false');input.value=select.value?select.selectedOptions[0]?.textContent||'':'';}});
    const sync=()=>{input.disabled=select.disabled;input.value=select.value?select.selectedOptions[0]?.textContent||'':'';list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');};
    select.addEventListener('change',sync);select.addEventListener('searchable:sync',sync);new MutationObserver(sync).observe(select,{childList:true,attributes:true,attributeFilter:['disabled']});sync();
  }
  root.SearchableSelect={attach,init:()=>['territory-place-select','pair-place','crm-place-filter'].forEach(id=>attach(document.getElementById(id)))};
})(window);
