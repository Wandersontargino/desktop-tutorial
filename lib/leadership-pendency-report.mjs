import {countableForResults} from './crm-model.mjs';
import {pendencyScope,registrationCategory,pendencyDetail} from './pendency-report.mjs';

export const leadershipPendencyModes=[
  {id:'all',label:'Todas as pendências: principais e secundárias'},
  {id:'primary',label:'Somente problemas nos dados principais'},
  {id:'secondary',label:'Aprovados com pendências secundárias'},
  {id:'unlocated',label:'Não contabilizados: local não confirmado'},
];
const int=value=>new Intl.NumberFormat('pt-BR').format(value);
const red='#b52838',amber='#946200',green='#208a5b';
export function buildLeadershipPendencyReport(records,options={}){
  const mode=leadershipPendencyModes.find(item=>item.id===(options.mode||'all'));
  if(!mode)throw Error('Escolha um tipo de pendência válido.');
  // Batch reports cover the entire authorized scope, independently of list filters.
  const base=pendencyScope(records,{user:options.user,mode:'all'});
  const matches=record=>mode.id==='unlocated'?!countableForResults(record):mode.id==='secondary'?registrationCategory(record)==='secondary':mode.id==='primary'?registrationCategory(record)==='unapproved'||!countableForResults(record):registrationCategory(record)!=='complete'||!countableForResults(record);
  const groups=base.groups.map(group=>({...group,records:group.active.filter(matches).sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR')||String(a.id).localeCompare(String(b.id)))})).filter(group=>group.records.length);
  const selectedCount=groups.reduce((sum,group)=>sum+group.records.length,0),unlocated=groups.reduce((sum,group)=>sum+group.records.filter(r=>!countableForResults(r)).length,0);
  const blocks=groups.map((group,index)=>{
    const rows=group.records.map(r=>{
      const principal=(r.primaryFlags||[]).length,secondary=(r.secondaryFlags||[]).length,located=countableForResults(r),details=[];
      if(principal&&mode.id!=='secondary')details.push('Principal: '+pendencyDetail(r,'primary'));
      if(secondary&&mode.id!=='primary')details.push('Secundária: '+pendencyDetail(r,'secondary'));
      if(!located&&!details.some(message=>/local|zona|seção/i.test(message)))details.unshift('Local não confirmado: conferir zona e seção.');
      return [String(r.name||'Nome não informado')+' / '+(r.title||'Título não informado'),(r.zone?String(r.zone).padStart(3,'0'):'—')+' / '+(r.section?String(r.section).padStart(4,'0'):'—'),details.join(' ')||'Conferir dados principais',located?'Local confirmado':'Não contabilizado'];
    });
    return {type:'table',category:'leadership-pendencies',leadership:group.leadership,coordinator:group.coordinator,pageBreakBefore:index>0,compact:true,title:group.leadership+' - Coord.: '+group.coordinator+' | '+int(group.counts.total)+' cadastros; '+int(group.records.length)+' nesta lista; '+int(group.records.filter(r=>!countableForResults(r)).length)+' sem local confirmado',headers:['Nome / título','Zona / seção','Pendências para corrigir','Contagem'],widths:[2.7,.85,4.4,1.5],rows,cellColors:group.records.map(r=>[null,null,registrationCategory(r)==='unapproved'||!countableForResults(r)?red:amber,countableForResults(r)?green:red])};
  });
  if(!selectedCount)blocks.push({type:'paragraph',text:'Nenhuma pendência deste tipo nas lideranças autorizadas. Nenhum cadastro foi alterado.'});
  const report={title:'Pendências por liderança',headerSubtitle:'Conferência cadastral - relatório em lote',subtitle:mode.label,layout:'leadership-pages',paperFormat:'compact',compactIndicators:true,
    generatedAt:new Date(options.generatedAt||Date.now()).toLocaleString('pt-BR',{timeZone:'America/Belem'}),
    meta:[['Escopo','Todas as lideranças autorizadas; filtros da listagem não limitam este PDF.'],['Resumo',int(base.counts.total)+' cadastros ativos; '+int(selectedCount)+' nesta listagem; '+int(groups.length)+' grupos de liderança/coordenação com pendências.'],['Não contabilizados nesta lista',int(unlocated)+' por local não confirmado. Pendências secundárias não excluem por si só.'],['Base','Revisão '+(Number(options.revision)||0)+'; '+(options.online===false?'cópia offline':'cópia disponível neste aparelho')+'; '+int(Number(options.pendingChanges)||0)+' edições não sincronizadas'+(options.conflicts?'; '+int(Number(options.conflicts)||0)+' conflitos para revisão':'')]],
    note:'Vermelho: problema principal ou local não confirmado. Âmbar: pendência secundária. Cada liderança/coordenação começa em nova página; listas grandes continuam sem cortar registros. Local confirmado não substitui a deduplicação e o recorte municipal das análises, nem uma consulta oficial do título ao TSE.',blocks};
  return {report,groups,total:base.counts.total,selectedCount,unlocated,filename:'PENDENCIAS_POR_LIDERANCA_'+mode.id.toUpperCase()+'.pdf'};
}
