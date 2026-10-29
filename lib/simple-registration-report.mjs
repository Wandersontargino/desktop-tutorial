import {normalize,confirmedElectoralLocation,registrationOK} from './crm-model.mjs';

export const simpleRegistrationModes=[
  {id:'simple-all',label:'Relatório simples: OK e com pendência'},
  {id:'simple-ok',label:'Relatório simples: somente OK'},
  {id:'simple-problems',label:'Relatório simples: somente com pendência'},
];
const canRead=(r,u)=>u?.role==='owner'||u?.role==='leader'&&normalize(r.leadership)===normalize(u.scope)||u?.role==='coordinator'&&normalize(r.coordinator)===normalize(u.scope);
const ok=registrationOK;
const issues=new Map([
  ['Nome não informado.','Nome ausente'],
  ['Formato ou dígitos do título não conferem.','Título inválido'],
  ['Zona ausente ou inválida.','Zona ausente ou inválida'],
  ['Seção ausente ou inválida.','Seção ausente ou inválida'],
  ['Zona/seção tem mais de um local: conferir município.','Conferir município do local'],
  ['Zona/seção não localizada na fonte de 2026.','Local de votação não confirmado'],
  ['Título também informado em outro cadastro. Conferir identidade antes de unir.','Título duplicado'],
]);
export function simpleRegistrationProblem(r){
  if(ok(r))return 'OK';
  const result=[...new Set((r.primaryFlags||[]).map(f=>issues.get(f.message)||f.message))];
  if(!confirmedElectoralLocation(r)&&!result.some(s=>/local|município/i.test(s)))result.push('Local de votação não confirmado');
  return result.join('; ')||'Dados principais não validados';
}
export function simpleRegistrationMunicipality(record,{municipality='',municipalityName='município em análise'}={}){
  if(!confirmedElectoralLocation(record))return {status:'unknown',text:'Município não confirmado'};
  if(municipality&&String(record.location.cityCode)!==String(municipality))return {status:'outside',text:'Fora de '+municipalityName+' - vota em '+record.location.city};
  return {status:'inside',text:''};
}
export function simpleRegistrationScope(records,{user,leadership='',search=''}={}){
  if(!user)throw new Error('Desbloqueie a base para emitir o relatório.');
  const active=records.filter(r=>!r.deleted&&canRead(r,user)&&(!leadership||normalize(r.leadership)===normalize(leadership)));
  const groups=new Map(),term=normalize(search);
  for(const r of active){
    const key=normalize(r.leadership)||'SEM LIDERANCA';
    if(!groups.has(key))groups.set(key,{leadership:r.leadership||'SEM LIDERANÇA',records:[],selected:[],total:0,ok:0,problems:0});
    const g=groups.get(key);g.records.push(r);g.total++;ok(r)?g.ok++:g.problems++;
    if(!term||normalize([r.name,r.title,r.zone,r.section,r.contact,r.leadership,r.coordinator,simpleRegistrationProblem(r)].join(' ')).includes(term))g.selected.push(r);
  }
  const list=[...groups.values()].sort((a,b)=>a.leadership.localeCompare(b.leadership,'pt-BR'));
  for(const g of list)g.selected.sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR')||String(a.id).localeCompare(String(b.id)));
  return {groups:list,total:active.length,ok:active.filter(ok).length,problems:active.filter(r=>!ok(r)).length};
}
export function buildSimpleRegistrationReport(records,options={}){
  const mode=options.mode||'simple-all';
  if(!simpleRegistrationModes.some(m=>m.id===mode))throw new Error('Escolha um relatório simples válido.');
  const scope=simpleRegistrationScope(records,options),blocks=[];
  const colorOK='#208a5b',colorProblem='#bc3030';
  if(scope.groups.length>1)blocks.push({type:'table',title:'Resumo por liderança',compact:true,headers:['Liderança','Cadastros','OK','Com pendência'],widths:[4,1,1,1.5],rows:scope.groups.map(g=>[g.leadership,String(g.total),String(g.ok),String(g.problems)]),cellColors:scope.groups.map(()=>[null,null,colorOK,colorProblem])});
  let selectedCount=0;
  for(const g of scope.groups){
    const selected=g.selected.filter(r=>mode==='simple-all'||(mode==='simple-ok'?ok(r):!ok(r)));
    if(!selected.length&&options.search)continue;
    const summary=g.leadership+' - '+g.total+' cadastros | '+g.ok+' OK | '+g.problems+' com pendência';
    let firstTable=true;
    for(const status of ['ok','problems']){
      if(mode==='simple-ok'&&status!=='ok'||mode==='simple-problems'&&status!=='problems')continue;
      const list=selected.filter(r=>(status==='ok')===ok(r));
      if(!list.length)continue;
      const territorial=list.map(r=>simpleRegistrationMunicipality(r,options));
      const rows=list.map((r,i)=>{
        const t=territorial[i],place=t.status==='unknown'?t.text:r.location.place+(t.status==='outside'?' | '+t.text:'');
        return [r.name||'Nome não informado',r.zone?String(r.zone).padStart(3,'0'):'—',r.section?String(r.section).padStart(4,'0'):'—',place,simpleRegistrationProblem(r)];
      });
      selectedCount+=rows.length;
      blocks.push({type:'table',category:status,title:firstTable?summary:g.leadership+' - '+(status==='ok'?'OK':'COM PENDÊNCIA')+' ('+rows.length+')',compact:true,titleInset:20,headers:['Nome','Zona','Seção','Local de votação','Situação'],widths:status==='ok'?[3,.65,.75,4,1.1]:[2.6,.65,.8,2.7,2],rows,cellColors:rows.map((r,i)=>[null,null,null,territorial[i].status==='outside'?'#946200':territorial[i].status==='unknown'?colorProblem:null,status==='ok'?colorOK:colorProblem])});
      firstTable=false;
    }
  }
  if(!selectedCount)blocks.push({type:'paragraph',text:'Nenhum cadastro neste tipo de listagem.'});
  const meta=[['Resumo',scope.total+' cadastros | '+scope.ok+' OK | '+scope.problems+' com pendência']];
  if(options.municipality)meta.push(['Município em análise',options.municipalityName||'Município selecionado']);
  if(options.search)meta.push(['Busca',options.search]);
  if(options.pendingChanges||options.conflicts||options.online===false)meta.push(['Base utilizada',(options.online===false?'Cópia offline. ':'')+(Number(options.pendingChanges)||0)+' edição(ões) não sincronizada(s)'+(options.conflicts?' | '+options.conflicts+' conflito(s)':'')]);
  const report={title:'Relatório simples de cadastros',headerSubtitle:'Lideranças - dados principais',subtitle:(options.leadership||'Todas as lideranças autorizadas')+(mode==='simple-all'?'':mode==='simple-ok'?' - somente OK':' - somente com pendência'),generatedAt:new Date(options.generatedAt||Date.now()).toLocaleString('pt-BR',{timeZone:'America/Belem'}),meta,note:'OK: nome, título, zona, seção e local de votação validados. COM PENDÊNCIA: falta ou divergência em algum desses dados.'+(options.municipality?' Cadastros de outros municípios ou sem município confirmado ficam fora da contabilidade municipal.':''),blocks};
  report.indicators=[{label:'Cadastros ativos',value:String(scope.total)},{label:'Dados principais OK',value:String(scope.ok),color:colorOK},{label:'Com pendência principal',value:String(scope.problems),color:colorProblem},{label:'Linhas na listagem escolhida',value:String(selectedCount)}];
  report.summaryChart={title:'Conferência dos dados principais',rows:[{label:'Dados principais OK',values:[{label:'Cadastros',value:scope.ok,color:colorOK}]},{label:'Com pendência principal',values:[{label:'Cadastros',value:scope.problems,color:colorProblem}]}]};
  report.summaryNote='Indicadores: todos os ativos da liderança. A listagem segue o tipo escolhido e a busca. OK refere-se aos dados principais; não confirma a situação oficial do título no TSE. Outros municípios e localização não confirmada ficam fora da contabilidade municipal.';
  report.finalResult={title:'Resultado da conferência cadastral',summary:scope.total+' cadastros • '+scope.ok+' com dados principais OK • '+scope.problems+' com pendência principal',detail:selectedCount+' linhas na listagem escolhida. Contagem cadastral; não representa votos.'};
  return {report,scope,selectedCount,filename:'RELATORIO_SIMPLES_CADASTROS_'+(mode==='simple-all'?'TODOS':mode==='simple-ok'?'OK':'PENDENCIAS')+'.pdf'};
}
