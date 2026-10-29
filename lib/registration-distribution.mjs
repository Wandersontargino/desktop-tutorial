const integer=new Intl.NumberFormat('pt-BR');
const percent=value=>(value*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
function electoralNumber(value,max,width){
  const text=String(value??'').trim();
  if(!text)return {key:'',label:'Não informada',valid:false};
  if(!/^\d+$/.test(text)||Number(text)<1||Number(text)>max)return {key:'?',label:'A conferir',valid:false};
  return {key:String(Number(text)),label:String(Number(text)).padStart(width,'0'),valid:true};
}
// Count registration IDs, not votes or inferred voters. Repeated titles remain
// registrations and retain their existing validation flags.
export function registrationDistribution(records,{archived=false}={}){
  const seen=new Set(),rows=records.filter(record=>{
    if(Boolean(record.deleted)!==archived)return false;
    if(record.id&&seen.has(record.id))return false;
    if(record.id)seen.add(record.id);return true;
  }),zones=new Map(),sections=new Map();let missingZone=0,invalidZone=0,missingSection=0,invalidSection=0;
  for(const record of rows){
    const zone=electoralNumber(record.zone,999,3),section=electoralNumber(record.section,9999,4);
    if(zone.key==='')missingZone++;if(zone.key==='?')invalidZone++;
    if(section.key==='')missingSection++;if(section.key==='?')invalidSection++;
    if(!zones.has(zone.key))zones.set(zone.key,{key:zone.key,zone:zone.label,valid:zone.valid,count:0});
    zones.get(zone.key).count++;
    const key=zone.key+'|'+section.key;
    if(!sections.has(key))sections.set(key,{key,zoneKey:zone.key,sectionKey:section.key,zone:zone.label,section:section.label,valid:zone.valid&&section.valid,count:0,places:new Set()});
    const group=sections.get(key);group.count++;group.places.add(record.location?.place||'Local não confirmado');
  }
  const order=value=>value===''?10000:value==='?'?10001:Number(value),total=rows.length;
  const zoneRows=[...zones.values()].sort((a,b)=>order(a.key)-order(b.key)).map(row=>({...row,share:total?row.count/total:0}));
  const sectionRows=[...sections.values()].sort((a,b)=>order(a.zoneKey)-order(b.zoneKey)||order(a.sectionKey)-order(b.sectionKey)).map(({places,...row})=>({...row,place:places.size===1?[...places][0]:'Locais divergentes — conferir',share:total?row.count/total:0}));
  return {total,archived,zones:zoneRows,sections:sectionRows,knownZones:zoneRows.filter(r=>r.valid).length,knownSections:sectionRows.filter(r=>r.valid).length,missingZone,invalidZone,missingSection,invalidSection};
}
export function registrationDistributionReport(snapshot){
  const data=registrationDistribution(snapshot.records,snapshot);
  return {report:{title:'Resumo dos cadastros por zona e seção',subtitle:snapshot.label||'Todos os cadastros autorizados',headerSubtitle:'Distribuição cadastral • base atual',generatedAt:new Date().toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}),compactIndicators:true,
    meta:[['Situação',data.archived?'Somente cadastros arquivados':'Cadastros ativos, incluindo pendências'],['Recorte',snapshot.filterLabel||'Sem filtros adicionais']],
    indicators:[{label:'Cadastros no recorte',value:integer.format(data.total)},{label:'Zonas informadas',value:integer.format(data.knownZones)},{label:'Seções com zona informada',value:integer.format(data.knownSections)},{label:'Sem zona / zona a conferir',value:integer.format(data.missingZone+data.invalidZone)}],
    note:'Cada cadastro é contado uma vez pelo seu ID. Pendências de preenchimento e títulos repetidos não retiram registros deste resumo. Percentuais calculados sobre os '+integer.format(data.total)+' cadastros do recorte. '+(snapshot.note||''),
    blocks:[{type:'table',title:'Distribuição por zona',compact:true,headers:['Zona','Cadastros','% do recorte'],widths:[3,1,1],rows:[...data.zones.map(r=>[r.zone,integer.format(r.count),percent(r.share)]),['TOTAL',integer.format(data.total),data.total?'100,0%':'—']]},
      {type:'table',title:'Distribuição por zona e seção',compact:true,headers:['Zona','Seção','Local de votação','Cadastros','% do recorte'],widths:[1,1,3,1,1],rows:data.sections.map(r=>[r.zone,r.section,r.place,integer.format(r.count),percent(r.share)])}]},filename:'RESUMO_CADASTROS_ZONA_SECAO_PA_2026.pdf'};
}
export function registrationDistributionCSV(snapshot){
  const data=registrationDistribution(snapshot.records,snapshot),quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  const rows=[['Tipo','Zona','Seção','Local de votação','Cadastros','% do recorte'],...data.zones.map(r=>['ZONA',r.zone,'','',r.count,percent(r.share)]),...data.sections.map(r=>['SEÇÃO',r.zone,r.section,r.place,r.count,percent(r.share)])];
  return '\ufeff'+rows.map(row=>row.map(value=>quote(/^[=+@-]/.test(String(value))?"'"+value:value)).join(';')).join('\r\n');
}
