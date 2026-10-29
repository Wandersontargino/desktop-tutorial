(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  let context,prepared=null,epoch=0,opener,sectionSelections=new Map();
  function reset(){prepared=null;$('report-prepare').removeAttribute('aria-busy');$('report-preview').hidden=true;$('report-download').disabled=true;$('report-feedback').textContent='';$('report-preview-content').textContent='';$('report-shortcuts').hidden=true;const final=$('report-preview-final');if(final){final.replaceChildren();final.hidden=true;}}
  function selected(){return context?.options.find(o=>o.id===$('report-type').value);}
  function selectedSections(option=selected()){const checked=new Set([...$('report-content-options').querySelectorAll('input:checked')].map(input=>input.value));return (option?.sections||[]).filter(section=>checked.has(section.id)).map(section=>section.id);}
  function signature(){return JSON.stringify([context?.signature(),$('report-type').value,$('complete-report-organization').value,$('report-format').value,selectedSections()]);}
  function updateContentStatus(option){const count=selectedSections(option).length;$('report-content-status').textContent=option?.sections?(count?count+' quadro(s) selecionado(s).':'Selecione pelo menos um quadro.'):'';$('report-prepare').disabled=!option||!!option.sections&&!count;}
  function renderSections(option){
    $('report-content-field').hidden=!option?.sections;$('report-content-options').replaceChildren();
    if(option?.sections){
      if(!sectionSelections.has(option.id))sectionSelections.set(option.id,new Set(option.defaultSections||option.sections.map(section=>section.id)));
      for(const section of option.sections){const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');input.type='checkbox';input.value=section.id;input.checked=sectionSelections.get(option.id).has(section.id);text.textContent=section.label;
        input.addEventListener('change',()=>{const values=sectionSelections.get(option.id);input.checked?values.add(section.id):values.delete(section.id);epoch++;reset();updateContentStatus(option);});label.append(input,text);$('report-content-options').append(label);}
    }
    updateContentStatus(option);
  }
  function change(){epoch++;reset();const option=selected();const summaryChoice=$('report-format').querySelector('option[value="summary"]');if(summaryChoice)summaryChoice.disabled=!!option?.leadershipPages;if(option?.leadershipPages&&$('report-format').value==='summary')$('report-format').value='compact';$('report-description').textContent=option?.description||'';$('report-layout-field').hidden=!option?.regionalLayout;$('report-format').disabled=!!option?.singlePage;$('report-format-field').hidden=!!option?.singlePage;if(option?.singlePage)$('report-format').value='summary';$('report-format-help').textContent=option?.leadershipPages?'Cada liderança começa em nova página. Todas as linhas são preservadas; listas maiores continuam nas páginas seguintes, com cabeçalho repetido.':$('report-format').value==='summary'?'Uma folha A4 com os indicadores, o resultado consolidado e destaques. Listas extensas são resumidas e identificadas; nomes individuais ficam na listagem completa.':$('report-format').value==='compact'?'Todas as linhas do conteúdo escolhido, com menos espaços e sem abrir uma página para cada grupo. A quantidade de folhas depende do recorte.':'Mantém os gráficos, tabelas e a disposição original do relatório. Confira a quantidade de páginas antes de baixar.';renderSections(option);}
  function clearPrivateContent(){for(const id of ['report-description','report-format-help','report-preview-title','report-preview-candidate','report-preview-pages','report-preview-size','report-preview-warning','report-preview-content','report-content-status'])$(id).textContent='';$('report-preview-meta').replaceChildren();$('report-type').replaceChildren();$('report-content-options').replaceChildren();$('report-content-field').hidden=true;sectionSelections.clear();}
  function close(){const wasPrivate=context?.private;epoch++;reset();context=null;$('report-center').close();if(wasPrivate)clearPrivateContent();opener?.focus?.();}
  function init(){
    if(!$('report-center')||$('report-center').dataset.ready)return;
    $('report-center').dataset.ready='true';
    const final=document.createElement('section');final.id='report-preview-final';final.className='report-final-result';final.hidden=true;final.setAttribute('aria-label','Resultado final do relatório');$('report-preview-meta').after(final);
    $('report-close').addEventListener('click',close);
    $('report-center').addEventListener('cancel',event=>{event.preventDefault();close();});
    $('report-type').addEventListener('change',change);
    $('report-format').addEventListener('change',change);
    $('complete-report-organization').addEventListener('change',change);
    $('report-prepare').addEventListener('click',prepare);
    $('report-download').addEventListener('click',download);
    for(const [id,format]of [['report-use-summary','summary'],['report-use-compact','compact']])$(id).addEventListener('click',()=>{$('report-format').value=format;change();prepare();});
  }
  function open(value){
    init();if(context?.private)clearPrivateContent();opener=document.activeElement;context=value;sectionSelections=new Map();epoch++;reset();
    $('report-type').replaceChildren(...value.options.map(o=>new Option(o.label,o.id)));
    $('report-type').value=value.defaultType||value.options[0]?.id||'';
    $('report-format').value=value.defaultFormat||'summary';
    $('complete-report-organization').value=value.layout||'consolidated';
    change();$('report-center').showModal();$('report-type').focus();
  }
  async function prepare(){
    const option=selected();if(!option)return;
    const run=++epoch,start=signature(),ctx=context;
    reset();$('report-prepare').disabled=true;$('report-prepare').setAttribute('aria-busy','true');
    $('report-feedback').textContent='Preparando conteúdo e conferindo a quantidade de páginas…';
    try{
      await new Promise(resolve=>setTimeout(resolve,0));
      const sections=selectedSections(option);if(option.sections&&!sections.length)throw new Error('Selecione pelo menos um quadro para o relatório.');
      const format=$('report-format').value,prepareReport=format==='summary'&&option.prepareSummary?option.prepareSummary:option.prepare;
      const value=await prepareReport($('complete-report-organization').value,sections);
      if(run!==epoch)return;
      if(start!==signature())throw new Error('A consulta mudou. Prepare a prévia novamente com os filtros atuais.');
      if(!value?.report)throw new Error('Não há dados para este relatório.');
      const alreadySummary=value.report.layout==='single-page-summary';
      value.report=root.ReportPDF.formatReport(value.report,format);
      if(!alreadySummary&&format!=='original')value.filename=value.filename.replace(/\.pdf$/i,'_'+(format==='summary'?'resumo_A4':'enxuto')+'.pdf');
      const bytes=root.ReportPDF.build(value.report),info=root.ReportPDF.inspect(bytes);
      if(!info.pages)throw new Error('Não foi possível conferir as páginas do PDF.');
      prepared={...value,bytes,signature:start,context:ctx};
      $('report-preview-title').textContent=value.report.title;
      $('report-preview-candidate').textContent=value.report.subtitle||'';
      $('report-preview-pages').textContent=info.pages+' '+(info.pages===1?'página':'páginas');
      $('report-preview-size').textContent=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(bytes.length/1024)+' KB';
      $('report-preview-content').textContent=value.report.summaryInfo?.description||(option.leadershipPages?'Um único PDF com todas as pendências selecionadas. Cada liderança/coordenação começa em nova página; continuação automática sem cortar nomes.':format==='summary'?'Resumo de uma página. Todos os territórios da seleção entram nos totais; listas extensas podem estar consolidadas.':format==='compact'?'Formato enxuto: todas as linhas do conteúdo selecionado.':'Disposição original do relatório selecionado.');
      const meta=$('report-preview-meta');meta.replaceChildren();
      for(const [label,text] of value.report.meta||[]){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=text;row.append(dt,dd);meta.append(row);}
      if(value.report.finalResult){const data=value.report.finalResult,panel=$('report-preview-final'),title=document.createElement('small'),summary=document.createElement('strong'),detail=document.createElement('p');title.textContent=data.title;summary.textContent=data.summary;detail.textContent=data.detail||'';panel.replaceChildren(title,summary,detail);panel.hidden=false;}
      $('report-preview-warning').hidden=info.pages<=5;
      $('report-preview-warning').textContent=option.leadershipPages?'Este relatório tem '+info.pages+' páginas. A separação por liderança e todas as linhas foram preservadas. Para reduzir folhas, selecione um tipo de pendência mais específico.':'Este relatório tem '+info.pages+' páginas. O resumo A4 mantém os indicadores e o resultado consolidado em uma folha; a listagem completa continua disponível no formato Enxuto.';
      $('report-shortcuts').hidden=info.pages<=5||!!option.leadershipPages;$('report-use-compact').hidden=format==='compact';
      $('report-preview').hidden=false;$('report-download').disabled=false;
      $('report-feedback').textContent='Prévia pronta. Confira o conteúdo antes de baixar.';
    }catch(error){if(run===epoch)$('report-feedback').textContent=error.message||'Não foi possível preparar o relatório.';}
    finally{if(run===epoch){$('report-prepare').disabled=false;$('report-prepare').removeAttribute('aria-busy');}}
  }
  function download(){
    if(!prepared)return;
    if(prepared.context!==context||prepared.signature!==signature()){reset();$('report-feedback').textContent='A consulta mudou. Prepare uma nova prévia antes de baixar.';return;}
    root.ReportPDF.downloadBytes(prepared.bytes,prepared.filename);
    $('report-feedback').textContent='PDF enviado para download. Confira a pasta Downloads do aparelho.';
  }
  function clearPrivate(){if(context?.private)close();}
  root.ReportCenter={init,open,clearPrivate};
})(window);
