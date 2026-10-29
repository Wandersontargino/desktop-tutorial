(function(root){
  'use strict';
  const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
  const schoolKey=s=>normalize(s).replace(/[^A-Z0-9]/g,'');
  const num=s=>/^\d+$/.test(String(s??'').trim())?String(Number(s)):'';
  const schoolWords=s=>normalize(s).replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').replace(/^(?:(?:ESCOLA|EMEF|EMEIF|EM|EEEFM|EEEF|EEEM|EE|E M|E E|PROFESSOR|PROFESSORA|PROF) )+/,'').trim();
  const labels={matched:'Correspondência documental',review:'Conferência necessária',unmatched:'Sem correspondência',outside:'Outro município'};
  const fmt=n=>new Intl.NumberFormat('pt-BR').format(n);
  const indexes=new WeakMap();
  function sectionSet(text){return new Set((String(text).match(/\d+/g)||[]).map(num));}
  function index(data){
    if(!indexes.has(data))indexes.set(data,data.associated.map((school,i)=>({...school,index:i,key:schoolKey(school.name),words:schoolWords(school.name),sectionsSet:sectionSet(school.sections)})));
    return indexes.get(data);
  }
  function locationKey(record){const l=record.location||{};return JSON.stringify([l.cityCode||'',schoolKey(l.place),num(record.zone),num(record.section),!!record.locationConflict]);}
  function match(record,schools,aliases){
    const l=record.location||{},city=normalize(l.city),code=String(l.cityCode||'');
    const base={recordId:String(record.id||''),name:String(record.name||'Sem nome'),zone:num(record.zone),section:num(record.section),school:String(l.place||''),municipality:String(l.city||''),registrationReady:record.ready===true,council:'',poleId:'',suggestions:[]};
    const response=(status,reason,possible=[])=>({...base,status,reason,suggestions:[...new Set(possible.map(p=>p.poleId))]});
    if(record.locationConflict)return response('review','A localização do cadastro tem conflito.');
    if(code&&code!=='4154'||!code&&city&&city!=='ANANINDEUA')return response('outside','Município informado é diferente de Ananindeua.');
    if(code!=='4154'&&city!=='ANANINDEUA')return response('unmatched','Município não confirmado.');
    if(!base.school||['LOCALNAOCONFIRMADO','LOCALNAOINFORMADO'].includes(schoolKey(base.school)))return response('unmatched','Local de votação não confirmado.');
    if(!/^[1-9]\d{0,2}$/.test(base.zone)||!/^[1-9]\d{0,3}$/.test(base.section))return response('unmatched','Conferir zona e seção do cadastro.');
    const key=schoolKey(base.school),exact=schools.filter(s=>s.key===key),withSection=exact.filter(s=>s.sectionsSet.has(base.section)),poles=[...new Set(withSection.map(s=>s.poleId))];
    if(poles.length===1){const source=withSection[0];return {...response('matched','Escola de origem e seção coincidem com a relação de 2023.'),council:source.council,poleId:source.poleId,sourcePage:source.page,sourceSchool:source.name};}
    if(poles.length>1)return response('review','Escola e seção aparecem em mais de um polo na referência.',withSection);
    const alias=aliases[key];
    if(alias?.year===2023&&alias.confirmed===true){const targets=schools.filter(s=>s.poleId===alias.poleId&&s.name===alias.sourceSchool&&s.sectionsSet.has(base.section));if(targets.length===1){const source=targets[0];return {...response('matched','Nome da escola conferido manualmente; a seção consta na referência de 2023.'),method:'manual-school-reference',council:source.council,poleId:source.poleId,sourcePage:source.page,sourceSchool:source.name};}}
    if(exact.length)return response('review','Escola reconhecida, mas a seção não consta nessa escola na relação de 2023.',exact);
    const words=schoolWords(base.school),similar=schools.filter(s=>s.words===words&&words.length>=8);
    if(similar.length)return response('review','Nome semelhante com diferença na identificação da escola. Conferir a referência histórica.',similar);
    return response('unmatched','Escola não encontrada com correspondência documental na relação de 2023.');
  }
  function analyze(data,records,aliases={}){
    const schools=index(data),groups=new Map(),active=records.filter(r=>!r.deleted);
    for(const [i,r] of active.entries()){
      const title=String(r.title||'').replace(/\D/g,''),key=r.titleValid&&title?'t:'+title:'r:'+(r.id||i);
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);
    }
    const rows=[];
    for(const values of groups.values()){
      let row=match(values[0],schools,aliases);
      if(values.length>1&&(new Set(values.map(locationKey)).size>1||new Set(values.map(r=>normalize(r.name))).size>1))row={...row,council:'',poleId:'',status:'review',reason:'Título repetido com nomes ou localizações diferentes. Conferir a duplicidade.',suggestions:[]};
      rows.push({...row,sourceRecords:values.length});
    }
    return {year:2023,registrationYear:2026,active:active.length,total:rows.length,duplicates:active.length-rows.length,rows};
  }
  function select(result,filters={}){
    const query=normalize(filters.search);
    return result.rows.filter(r=>{
      const possibilities=[r.poleId,...r.suggestions];
      return (!filters.council||r.council===filters.council||possibilities.some(p=>p.startsWith(filters.council+':')))&&(!filters.pole||possibilities.includes(filters.pole))&&(!filters.status||r.status===filters.status)&&(!query||normalize([r.name,r.school,r.municipality,r.zone,r.section,r.reason].join(' ')).includes(query));
    });
  }
  function summary(rows){return Object.fromEntries(['matched','review','unmatched','outside'].map(status=>[status,rows.filter(r=>r.status===status).length]));}
  function byPole(data,rows){return data.poles.map(p=>({...p,count:rows.filter(r=>r.poleId===p.id).length,review:rows.filter(r=>r.status!=='matched'&&r.suggestions.includes(p.id)).length}));}
  function report(data,result,filters={},kind='summary'){
    const rows=select(result,filters),counts=summary(rows),poles=byPole(data,rows).filter(p=>p.count||p.review),total=rows.length;
    const report={electionYear:2023,headerSubtitle:'Cadastros atuais · referência de polos de 2023',title:'Cadastros por conselho e polo',subtitle:'Ananindeua. Associação territorial à relação oficial de 2023.',generatedAt:new Date().toLocaleString('pt-BR'),compactIndicators:true,
      meta:[['Conselho',filters.council?'Conselho Tutelar '+filters.council:'Todos'],['Polo',filters.pole?data.poles.find(p=>p.id===filters.pole)?.name||filters.pole:'Todos'],['Situação',labels[filters.status]||'Todas'],['Busca',filters.search||'Sem busca']],
      indicators:[{label:'Cadastros no filtro',value:fmt(total)},{label:'Correspondência documental',value:fmt(counts.matched)},{label:'Conferência necessária',value:fmt(counts.review)},{label:'Sem correspondência / outro município',value:fmt(counts.unmatched+counts.outside)}],
      sources:[data.sources.schools.url],note:'Base cadastral atual associada à referência de polos de 2023. A relação não informa zona eleitoral. Associação territorial não comprova comparecimento, elegibilidade histórica ou voto. Duplicidades com título válido são agrupadas no quadro, sem excluir registros da base.',
      blocks:[{type:'table',title:'Correspondências por polo'+(kind==='summary'?' — principais cinco':''),headers:['Conselho / polo','Escola polo','Correspondências'],widths:[1.2,4,1.4],rows:[...poles].sort((a,b)=>b.count-a.count).slice(0,kind==='summary'?5:undefined).map(p=>['CT '+p.council+' / '+p.number,p.name,fmt(p.count)])}],
      finalResult:{title:'Total da seleção',summary:fmt(total)+' cadastros: '+fmt(counts.matched)+' com correspondência; '+fmt(counts.review+counts.unmatched+counts.outside)+' para conferência ou fora do município.',detail:fmt(result.duplicates)+' repetição(ões) agrupada(s) na base autorizada.'}};
    if(kind==='summary')report.layout='single-page-summary';
    if(kind==='pending')report.blocks=[{type:'table',title:'Pendências de associação territorial do filtro',headers:['Nome','Zona / seção','Escola informada','Motivo'],widths:[2.2,1,2.5,3],rows:rows.filter(r=>r.status!=='matched').map(r=>[r.name,(r.zone||'—')+' / '+(r.section||'—'),r.school||'Não confirmada',r.reason])}];
    return report;
  }
  const api={normalize,schoolKey,sectionSet,analyze,select,summary,byPole,report,labels};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CouncilRegisterModel=api;
})(typeof window!=='undefined'?window:globalThis);
