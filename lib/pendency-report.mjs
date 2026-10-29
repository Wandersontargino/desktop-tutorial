import {normalize,confirmedElectoralLocation} from './crm-model.mjs';

const int=value=>new Intl.NumberFormat('pt-BR').format(value);
const tones={primary:'#bc3030',secondary:'#946200',ok:'#208a5b'};
export const pendencyModes=[
  {id:'all',label:'Todos os cadastros — três grupos'},
  {id:'complete',label:'Somente cadastros 100% completos'},
  {id:'approved',label:'Todos os aprovados na conferência cadastral'},
  {id:'secondary',label:'Aprovados com pendências secundárias'},
  {id:'unapproved',label:'Não aprovados — problemas principais'},
];
const messages=(record,category)=>(record[category+'Flags']||[]).map(flag=>flag.message);
const canRead=(record,user)=>user?.role==='owner'||user?.role==='leader'&&normalize(record.leadership)===normalize(user.scope)||user?.role==='coordinator'&&normalize(record.coordinator)===normalize(user.scope);
const has=(record,category)=>messages(record,category).length>0;
export const registrationCategory=record=>has(record,'primary')?'unapproved':has(record,'secondary')?'secondary':'complete';
const counts=records=>{
  const value={total:records.length,complete:0,secondary:0,unapproved:0};
  for(const record of records)value[registrationCategory(record)]++;
  value.approved=value.complete+value.secondary;
  value.approvalRate=value.total?value.approved/value.total:null;
  return value;
};
const categories=[{id:'complete',label:'100% completos'},{id:'secondary',label:'Aprovados com pendências secundárias'},{id:'unapproved',label:'Não aprovados: problemas principais'}];
const percent=value=>value==null?'—':(value*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
export function registrationMunicipality(record){
  const city=String(record.location?.city||'').trim(),code=String(record.location?.cityCode||'').trim();
  return confirmedElectoralLocation(record)?{key:code||normalize(city),code,name:city,identified:true}:{key:'unknown',code:'',name:'Município não confirmado',identified:false};
}
export function municipalitySummary(records,{municipality='',municipalityName=''}={}){
  const grouped=new Map();
  for(const record of records.filter(r=>!r.deleted)){
    const city=registrationMunicipality(record);
    if(!grouped.has(city.key))grouped.set(city.key,{...city,records:[]});grouped.get(city.key).records.push(record);
  }
  const rows=[...grouped.values()].map(group=>({...group,counts:counts(group.records)})).sort((a,b)=>Number(b.identified)-Number(a.identified)||a.name.localeCompare(b.name,'pt-BR'));
  const selected=municipality?rows.find(r=>r.key===String(municipality)):null;
  return {rows,code:String(municipality),name:selected?.name||municipalityName||'Todos os municípios identificados',selected:municipality?(selected?.counts||counts([])):counts(rows.filter(r=>r.identified).flatMap(r=>r.records)),outside:municipality?rows.filter(r=>r.identified&&r.key!==String(municipality)).reduce((n,r)=>n+r.counts.total,0):0,unknown:rows.find(r=>!r.identified)?.counts.total||0};
}
export function pendencyScope(records,{user,leadership='',mode='all',municipality='',municipalityName='',search=''}={}){
  if(!user||!pendencyModes.some(item=>item.id===mode))throw new Error('Desbloqueie a base e escolha um tipo de relatório válido.');
  const active=records.filter(r=>!r.deleted&&canRead(r,user)&&(!leadership||normalize(r.leadership)===normalize(leadership)));
  const term=normalize(search);
  const selected=active.filter(r=>(mode==='all'||(mode==='approved'?registrationCategory(r)!=='unapproved':registrationCategory(r)===mode))&&(!term||normalize([r.name,r.title,r.zone,r.section,r.contact,r.leadership,r.coordinator,...(r.primaryFlags||[]).map(f=>f.message)].join(' ')).includes(term)));
  const grouped=new Map();
  for(const r of active){
    const id=JSON.stringify([normalize(r.coordinator),normalize(r.leadership)]);
    if(!grouped.has(id))grouped.set(id,{id,leadership:r.leadership||'SEM LIDERANÇA',coordinator:r.coordinator||'Sem coordenador',active:[],records:[]});
    grouped.get(id).active.push(r);
  }
  for(const r of selected)grouped.get(JSON.stringify([normalize(r.coordinator),normalize(r.leadership)])).records.push(r);
  const groups=[...grouped.values()].filter(group=>group.records.length).map(group=>({...group,counts:counts(group.active),municipal:municipalitySummary(group.active,{municipality,municipalityName}),records:group.records.sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR')||String(a.id).localeCompare(String(b.id)))})).sort((a,b)=>a.leadership.localeCompare(b.leadership,'pt-BR')||a.coordinator.localeCompare(b.coordinator,'pt-BR'));
  return {leadership,mode,counts:counts(active),selectedCount:selected.length,groups,municipal:municipalitySummary(active,{municipality,municipalityName})};
}

const shortMessages=new Map([
  ['Formato ou dígitos do título não conferem.','Título: formato ou dígitos não conferem.'],
  ['Zona/seção tem mais de um local: conferir município.','Zona/seção ambígua: conferir município.'],
  ['Zona/seção não localizada na fonte de 2026.','Zona/seção não localizada (2026).'],
  ['Título também informado em outro cadastro. Conferir identidade antes de unir.','Título duplicado: conferir identidade antes de unir.'],
  ['Dígitos do CPF não conferem.','CPF: dígitos não conferem.'],
  ['Observação da origem exige conferência documental.','Conferir documento da ficha de origem.'],
  ['Telefone incompleto ou fora do padrão com DDD.','Telefone: conferir número e DDD.'],
  ['Liderança não atribuída.','Atribuir liderança.'],
]);
const missing=new Map([['RG ou CPF não informado.','RG ou CPF'],['Nome da mãe não informado.','nome da mãe'],['Nascimento não informado.','nascimento'],['Telefone não informado.','telefone']]);
export function pendencyDetail(record,category){
  const flags=messages(record,category),absent=flags.filter(message=>missing.has(message)).map(message=>missing.get(message));
  const details=flags.filter(message=>!missing.has(message)).map(message=>shortMessages.get(message)||message);
  if(absent.length)details.push('Informar: '+absent.join(', ')+'.');
  return details.join(' ')||(category==='primary'?'OK':'—');
}
export function buildPendencyReport(records,options={}){
  const scope=pendencyScope(records,options),mode=pendencyModes.find(item=>item.id===scope.mode),{total,complete,secondary,unapproved,approved,approvalRate}=scope.counts;
  const generatedAt=new Date(options.generatedAt||Date.now()).toLocaleString('pt-BR',{timeZone:'America/Belem'});
  const unsynced=Number(options.pendingChanges)||0,conflicts=Number(options.conflicts)||0;
  const blocks=[];
  const municipalityTable=(title,summary)=>({type:'table',title,compact:true,titleInset:32,headers:['Município eleitoral','Cadastros','Aprovados','Não aprovados','100% completos','Com secundárias'],widths:[2.5,.8,.85,.9,1,1],rows:summary.rows.map(r=>[r.name,int(r.counts.total),int(r.counts.approved),int(r.counts.unapproved),int(r.counts.complete),int(r.counts.secondary)]),cellColors:summary.rows.map(r=>[r.identified?null:tones.primary,null,tones.ok,tones.primary,tones.ok,tones.secondary])});
  if(scope.groups.length>1)blocks.push(municipalityTable('Distribuição geral por município — todos os cadastros do recorte',scope.municipal));
  if(options.summaryOnly){
    const rows=new Map();
    for(const group of scope.groups)for(const city of group.municipal.rows){const id=JSON.stringify([normalize(group.leadership),city.key]);if(!rows.has(id))rows.set(id,{leader:group.leadership,name:city.name,total:0,approved:0,unapproved:0,complete:0,secondary:0});const r=rows.get(id);for(const key of ['total','approved','unapproved','complete','secondary'])r[key]+=city.counts[key];}
    blocks.push({type:'table',title:'Lideranças por município — todos os cadastros ativos',compact:true,titleInset:32,headers:['Liderança','Município','Total','Aprov.','Não aprov.','100%','Sec.'],widths:[1.85,1.8,.6,.7,.9,.6,.6],rows:[...rows.values()].map(r=>[r.leader,r.name,int(r.total),int(r.approved),int(r.unapproved),int(r.complete),int(r.secondary)]),cellColors:[...rows.values()].map(()=>[null,null,null,tones.ok,tones.primary,tones.ok,tones.secondary])});
  }
  if(scope.groups.length>1&&!options.summaryOnly)blocks.push({type:'table',title:'Resumo do recorte por liderança e coordenação',compact:true,titleInset:32,headers:['Liderança / coordenador','Total','100% completos','Com secundárias','Não aprovados','Aprovados'],widths:[3.4,.65,.9,.95,.95,.8],rows:scope.groups.map(group=>[group.leadership+' / '+group.coordinator,int(group.counts.total),int(group.counts.complete),int(group.counts.secondary),int(group.counts.unapproved),int(group.counts.approved)]),cellColors:scope.groups.map(()=>[null,null,tones.ok,tones.secondary,tones.primary,tones.ok])});
  for(const group of scope.groups){
    if(options.summaryOnly)continue;
    blocks.push(municipalityTable(group.leadership+' • Coord.: '+group.coordinator+' • '+int(group.counts.total)+' cadastros; '+int(group.counts.approved)+' aprovados; '+int(group.counts.unapproved)+' não aprovados',group.municipal));
    if(scope.municipal.code)blocks.push({type:'paragraph',text:'Contabilidade de '+scope.municipal.name+': '+int(group.municipal.selected.approved)+' cadastros aprovados de '+int(group.municipal.selected.total)+' nesse município. '+int(group.municipal.outside)+' em outros municípios confirmados; '+int(group.municipal.unknown)+' com município não identificado. Somente os aprovados do município escolhido entram na conferência com os votos desse município.'});
    for(const municipality of municipalitySummary(group.records).rows){
    for(const category of categories){
      const records=municipality.records.filter(r=>registrationCategory(r)===category.id);if(!records.length)continue;
      const keep=category.id==='complete'?[0,1]:category.id==='secondary'?[0,1,3]:[0,1,2,3];
      const headers=['Nome / título','Zona / seção','Problemas principais','Pendências secundárias'];
      const widths=category.id==='complete'?[4,.9]:category.id==='secondary'?[2.4,.9,3.2]:[1.65,.8,2.5,2.6];
      const rows=records.map(r=>[String(r.name||'Nome não informado')+'\nTítulo: '+(r.title||'Não informado'),(r.zone||'—')+' / '+(r.section||'—'),pendencyDetail(r,'primary'),pendencyDetail(r,'secondary')]);
      const colors=records.map(r=>[category.id==='unapproved'?tones.primary:tones.ok,null,tones.primary,has(r,'secondary')?tones.secondary:null]);
      blocks.push({type:'table',category:category.id,title:group.leadership+' • '+municipality.name+' • '+category.label+' • '+int(records.length)+' cadastro(s)',compact:true,titleInset:32,headers:keep.map(i=>headers[i]),widths,rows:rows.map(row=>keep.map(i=>row[i])),cellColors:colors.map(row=>keep.map(i=>row[i]))});
    }
    }
  }
  if(!scope.selectedCount)blocks.push({type:'paragraph',text:'Nenhum cadastro ativo pertence ao grupo escolhido neste recorte.'});
  const report={title:'Cadastros por liderança',headerSubtitle:'Base de lideranças • conferência cadastral',subtitle:(scope.leadership||'Todas as lideranças autorizadas')+' • '+mode.label,generatedAt,compactIndicators:true,indicatorColumns:4,meta:[['Recorte',int(total)+' cadastro(s) ativo(s) • '+int(scope.groups.length)+' liderança(s)/coordenação(ões) na listagem'],['Listagem',int(scope.selectedCount)+' cadastro(s) neste PDF'],['Aprovados na conferência cadastral',int(approved)+' de '+int(total)+' ('+percent(approvalRate)+')'],['Base utilizada','Revisão central '+(Number(options.revision)||0)+' • '+(options.online===false?'cópia offline deste aparelho':'cópia disponível neste aparelho')],['Edições locais',int(unsynced)+' não sincronizada(s)'+(conflicts?' • '+int(conflicts)+' conflito(s) para revisão':'')]],indicators:[{label:'Cadastros ativos',value:int(total)},{label:'100% completos',value:int(complete),color:tones.ok,note:'Sem pendências identificadas.'},{label:'Aprovados com secundárias',value:int(secondary),color:tones.secondary,note:'Contam nos aprovados.'},{label:'Não aprovados',value:int(unapproved),color:tones.primary,note:'Fora dos aprovados.'}],note:'Total = 100% completos + aprovados com pendências secundárias + não aprovados. Aprovados = os dois primeiros grupos. Erros principais excluem o cadastro do total aprovado; pendências secundárias são informativas. Indicadores consideram todos os ativos da liderança; a listagem segue o tipo de relatório escolhido, sem limite da página ou dos demais filtros. Aprovação cadastral não confirma a situação oficial do título no TSE.',blocks};
  if(options.search)report.meta.push(['Busca rápida na listagem',options.search]);
  report.meta.push(['Município da contabilidade',scope.municipal.name+' • '+int(scope.municipal.selected.approved)+' aprovados de '+int(scope.municipal.selected.total)+' cadastros'],['Fora do município escolhido',scope.municipal.code?int(scope.municipal.outside)+' em outros municípios confirmados; '+int(scope.municipal.unknown)+' não identificados':'Município não identificado: '+int(scope.municipal.unknown)]);
  report.note+=' Município eleitoral confirmado pela fonte de zona/seção, não pelo endereço residencial. Cadastros de outros municípios e não identificados permanecem no relatório; não entram na contabilidade do município selecionado. A conferência utiliza somente votos dos mesmos município, zona, local e seção.';
  if(options.summaryOnly){report.subtitle=(scope.leadership||'Todas as lideranças autorizadas')+' • Resumo por municípios';report.meta[1]=['Formato','Resumo compacto, sem fichas individuais'];report.note='Aprovados = 100% completos + pendências secundárias; não aprovados ficam fora. Município eleitoral determinado pela zona/seção informada, não pelo endereço residencial. A contabilidade usa somente os aprovados e os votos do município selecionado. Outros municípios e não identificados permanecem na base. Aprovação cadastral não substitui consulta oficial ao TSE.';}
  report.summaryChart={title:'Qualidade cadastral — três grupos',rows:[{label:'100% completos',values:[{label:'Cadastros',value:complete,color:tones.ok}]},{label:'Com secundárias',values:[{label:'Cadastros',value:secondary,color:tones.secondary}]},{label:'Não aprovados',values:[{label:'Cadastros',value:unapproved,color:tones.primary}]}]};
  report.summaryNote='Aprovados = 100% completos + pendências secundárias. Não aprovados ficam fora dos aprovados. Indicadores consideram os ativos; a listagem segue o tipo e a busca. Município eleitoral é confirmado pela zona/seção, não pelo endereço residencial. Aprovação cadastral não substitui consulta oficial ao TSE.';
  report.finalResult={title:'Resultado da conferência cadastral',summary:int(total)+' cadastros • '+int(approved)+' aprovados • '+int(unapproved)+' não aprovados',detail:'Contabilidade de '+scope.municipal.name+': '+int(scope.municipal.selected.approved)+' aprovados de '+int(scope.municipal.selected.total)+' cadastros. Fora: '+int(scope.municipal.outside)+' em outros municípios; '+int(scope.municipal.unknown)+' sem município confirmado.'};
  return {report,filename:'CADASTROS_LIDERANCAS_PA_2026_'+(options.summaryOnly?'MUNICIPIOS':scope.mode.toUpperCase())+'.pdf'};
}
