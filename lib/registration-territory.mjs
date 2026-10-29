import {digits,normalize,validTitle,confirmedElectoralLocation} from './crm-model.mjs';
const fmt=new Intl.NumberFormat('pt-BR'),pct=v=>(100*v).toLocaleString('pt-BR',{maximumFractionDigits:1,minimumFractionDigits:1})+'%';
const number=(v,max,width)=>{const s=String(v??'').trim();return !s?{key:'',label:'Não informada',valid:false}:/^\d+$/.test(s)&&+s>0&&+s<=max?{key:String(+s),label:String(+s).padStart(width,'0'),valid:true}:{key:'?',label:'A conferir',valid:false};};
const tuple=(...parts)=>JSON.stringify(parts);
const cityKey=r=>String(r.location?.cityCode||normalize(r.location?.city)||'');
const locationKey=r=>r.location?.place&&r.location?.city?(r.location.code?tuple(cityKey(r),number(r.zone,999,3).key,'official',String(r.location.code)):tuple(cityKey(r),normalize(r.location.place),normalize(r.location.neighborhood))):'';
export function territorialPeople(records,{archived=false}={}){
  const seen=new Set(),groups=new Map();let registrations=0;
  for(const r of records){
    if(Boolean(r.deleted)!==archived)continue;
    if(r.id&&seen.has(r.id))continue;if(r.id)seen.add(r.id);registrations++;
    const key=validTitle(r.title)?'title:'+digits(r.title):'record:'+(r.id||registrations);
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);
  }
  const people=[...groups].map(([key,records])=>{
    const base=records.find(r=>r.location)||records[0];
    const zones=new Set(records.map(r=>number(r.zone,999,3).key));
    const sections=new Set(records.map(r=>number(r.section,9999,4).key));
    const locations=new Set(records.map(locationKey).filter(Boolean));
    const conflict=zones.size>1||sections.size>1||locations.size>1;
    const zone=conflict?number('?',999,3):number(base.zone,999,3),section=conflict?number('?',9999,4):number(base.section,9999,4);
    const location=!conflict&&zone.valid&&section.valid&&confirmedElectoralLocation(base)?base.location:null;
    const city=location?.city||'Município não confirmado',cityId=location?cityKey(base):'';
    const place=location?.place||'Local não confirmado',neighborhood=location?.neighborhood||'Bairro não confirmado';
    const placeId=location?.place?locationKey(base):'',neighborhoodId=location?.neighborhood?tuple(cityId,normalize(neighborhood)):'';
    const affiliations=new Map();for(const r of records){const leader=r.leadership||r._listName||'SEM LIDERANÇA',coordinator=r.coordinator||r._coordinator||'';affiliations.set(tuple(normalize(coordinator),normalize(leader)),{key:tuple(normalize(coordinator),normalize(leader)),leadership:leader,coordinator});}
    return {key,name:base.name||'Nome não informado',title:base.title||'',records,registrations:records.length,zone,section,city,cityId,place,placeId,neighborhood,neighborhoodId,locationConflict:conflict,ready:records.every(r=>r.ready===true)&&!conflict,secondaryPending:records.some(r=>r.secondaryPending),affiliations:[...affiliations.values()]};
  });
  return {people,registrations,merged:registrations-people.length};
}
export function filterTerritorialPeople(people,filters={}){
  return people.filter(p=>['city','zone','section','place','neighborhood'].every(field=>!filters[field]||(field==='city'?p.cityId:field==='zone'?p.zone.key:field==='section'?p.section.key:field==='place'?p.placeId:p.neighborhoodId)===(filters[field]==='__missing'?'':filters[field]))&&(!filters.leadership||p.affiliations.some(a=>a.key===filters.leadership)));
}
export function territorialSummary(people){
  const total=people.length;
  const grouped=(type)=>{
    const groups=new Map();for(const p of people){
      const entries=type==='leadership'?p.affiliations:type==='city'?[{key:p.cityId,label:p.city,valid:!!p.cityId}]:type==='zone'?[{key:p.zone.key,label:p.zone.label,valid:p.zone.valid}]:type==='section'?[{key:tuple(p.cityId,p.zone.key,p.section.key),label:'Zona '+p.zone.label+' / Seção '+p.section.label,valid:p.zone.valid&&p.section.valid,zone:p.zone.label,section:p.section.label}]:type==='place'?[{key:p.placeId,label:p.place,valid:!!p.placeId}]:[{key:p.neighborhoodId,label:p.neighborhood,valid:!!p.neighborhoodId}];
      for(const e of entries){const key=e.key;if(!groups.has(key))groups.set(key,{...e,label:e.label||e.leadership,city:type==='city'||type==='zone'||type==='leadership'?'':p.city,neighborhood:type==='place'?p.neighborhood:'',count:0,ready:0,secondary:0,people:[],zones:new Set(),sections:new Set(),places:new Set(),leaders:new Set()});
        const g=groups.get(key);g.count++;g.ready+=Number(p.ready);g.secondary+=Number(p.ready&&p.secondaryPending);g.people.push(p);if(p.zone.valid)g.zones.add(p.zone.label);if(p.zone.valid&&p.section.valid)g.sections.add(tuple(p.cityId,p.zone.key,p.section.key));if(p.placeId)g.places.add(p.placeId);for(const a of p.affiliations)if(normalize(a.leadership)!=='SEM LIDERANCA')g.leaders.add(a.key);
      }
    }
    return [...groups.values()].map(g=>({...g,share:total?g.count/total:0,primaryPending:g.count-g.ready,zones:[...g.zones].sort(),sections:g.sections.size,places:g.places.size,leaders:g.leaders.size})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'pt-BR',{numeric:true}));
  };
  const cities=grouped('city'),zones=grouped('zone'),sections=grouped('section'),places=grouped('place'),neighborhoods=grouped('neighborhood'),leaderships=grouped('leadership');
  return {people,total,cities,zones,sections,places,neighborhoods,leaderships,knownCities:cities.filter(g=>g.valid).length,knownZones:zones.filter(g=>g.valid).length,knownSections:sections.filter(g=>g.valid).length,knownPlaces:places.filter(g=>g.valid).length,knownNeighborhoods:neighborhoods.filter(g=>g.valid).length,knownLeaders:leaderships.filter(g=>normalize(g.label)!=='SEM LIDERANCA').length,ready:people.filter(p=>p.ready).length,secondary:people.filter(p=>p.ready&&p.secondaryPending).length,unlocated:people.filter(p=>!p.placeId).length,conflicts:people.filter(p=>p.locationConflict).length};
}
export function registrationTerritory(snapshot,filters={}){
  const base=territorialPeople(snapshot.records,snapshot);
  const reference=String(filters.city&&filters.city!=='__missing'?filters.city:snapshot.municipality?.code||'');
  const scoped=snapshot.municipality!=null||!!reference;
  const selected=reference?base.people.filter(p=>p.cityId===reference):scoped?base.people.filter(p=>p.cityId):base.people;
  const others=reference?base.people.filter(p=>p.cityId&&p.cityId!==reference):[];
  const unknown=scoped?base.people.filter(p=>!p.cityId):[];
  const name=reference?((snapshot.municipalityChoices||[]).find(c=>String(c[0])===reference)?.[1]||base.people.find(p=>p.cityId===reference)?.city||(String(snapshot.municipality?.code)===reference?snapshot.municipality.name:'Município selecionado')):'Todos os municípios identificados';
  const people=filterTerritorialPeople(selected,{...filters,city:reference||filters.city});
  const byCity=new Map();for(const p of others){if(!byCity.has(p.cityId))byCity.set(p.cityId,{code:p.cityId,name:p.city,people:[]});byCity.get(p.cityId).people.push(p);}
  const otherCities=[...byCity.values()].map(c=>({...c,total:c.people.length,leaders:territorialSummary(c.people).knownLeaders})).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'pt-BR'));
  const accounting={registrations:base.registrations,unique:base.people.length,merged:base.merged,confirmed:base.people.filter(p=>p.cityId).length,unknown:base.people.filter(p=>!p.cityId).length,scope:selected.length,other:others.length,shown:people.length,filteredOut:selected.length-people.length};
  return {...territorialSummary(people),base,filters,accounting,municipality:scoped?{code:reference,all:!reference,name,scopeTotal:selected.length,otherTotal:others.length,unknownTotal:unknown.length}:null,otherCities,otherPeople:others,unknownPeople:unknown};
}
export function registrationAccounting(data){
  const a=data.accounting;
  return [['Cadastros na base deste recorte',a.registrations],['Pessoas únicas na base',a.unique],['Repetições consolidadas',a.merged],['Pessoas com local confirmado',a.confirmed],['Município não confirmado',a.unknown],...(data.municipality&&!data.municipality.all?[['Outros municípios',a.other]]:[]),['Pessoas no recorte exibido',a.shown],...(a.filteredOut?[['Fora dos filtros territoriais',a.filteredOut]]:[])];
}
export const registrationTerritorySections=[{id:'municipalities',label:'Municípios'},{id:'zones',label:'Zonas'},{id:'neighborhoods',label:'Bairros'},{id:'places',label:'Locais de votação / escolas'},{id:'sections',label:'Zonas e seções'},{id:'leaderships',label:'Lideranças'}];
export function registrationTerritoryReport(snapshot,filters={},sections){
  const data=registrationTerritory(snapshot,filters);
  const basic=(label,groups)=>{const city=groups.some(g=>g.city);return {type:'table',title:label,compact:true,headers:['Área',...(city?['Município']:[]),'Cadastros','% do recorte','Lideranças','Pend. principais'],widths:[3,...(city?[2]:[]),1,1,1,1],rows:groups.map(g=>[g.label+(g.neighborhood?' • '+g.neighborhood:''),...(city?[g.city]:[]),fmt.format(g.count),pct(g.share),fmt.format(g.leaders),fmt.format(g.primaryPending)])};};
  const selected=sections===undefined?registrationTerritorySections.filter(s=>s.id!=='municipalities'):registrationTerritorySections.filter(s=>Array.isArray(sections)&&sections.includes(s.id));
  if(!selected.length||sections!==undefined&&(!Array.isArray(sections)||sections.some(id=>!registrationTerritorySections.some(s=>s.id===id))))throw new Error('Selecione pelo menos um quadro válido para o relatório.');
  const tables={municipalities:()=>basic('Distribuição por município',data.cities),zones:()=>basic('Distribuição por zona',data.zones),neighborhoods:()=>basic('Distribuição por bairro',data.neighborhoods),places:()=>basic('Distribuição por local de votação',data.places),sections:()=>basic('Distribuição por zona e seção',data.sections),leaderships:()=>({type:'table',title:'Lideranças no recorte',compact:true,headers:['Liderança','Coordenação','Cadastros vinculados','% do recorte'],widths:[3,3,1,1],rows:data.leaderships.map(g=>[g.label,g.coordinator||'Sem coordenação',fmt.format(g.count),pct(g.share)])})};
  return {filename:'TERRITORIO_CADASTROS_PA_2026.pdf',report:{title:'Território dos cadastros',subtitle:snapshot.label||'Todas as lideranças autorizadas',headerSubtitle:'Zona • bairro • local de votação • seção',generatedAt:new Date().toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}),compactIndicators:true,
    meta:[...(data.municipality?[['Município em análise',data.municipality.name]]:[]),['Escopo',snapshot.archived?'Somente arquivados':'Cadastros ativos, incluindo pendências'],['Filtros',snapshot.filterLabel||'Todos os territórios'],['Conteúdo do PDF',selected.map(s=>s.label).join(' • ')],...registrationAccounting(data).map(([label,value])=>[label,fmt.format(value)])],
    indicators:[{label:'Cadastros únicos',value:fmt.format(data.total)},{label:'Locais',value:fmt.format(data.knownPlaces)},{label:'Bairros',value:fmt.format(data.knownNeighborhoods)},{label:'Lideranças',value:fmt.format(data.knownLeaders)}],
    note:(data.municipality?(data.municipality.all?'Somente locais confirmados entram no recorte. ':'Totais calculados somente para '+data.municipality.name+'. '):'')+'Cadastros únicos; não representam votos apurados. Escola e bairro vêm do local eleitoral confirmado. Repetições de título válido contam uma vez; vínculos de liderança podem se sobrepor. '+(!data.municipality?data.unlocated+' sem local confirmado, incluídos no total. ':'')+(snapshot.note||''),
    blocks:[...selected.map(s=>tables[s.id]()),...(sections===undefined&&data.municipality?[...(!data.municipality.all?[{type:'table',title:'Outros municípios — fora da contabilidade de '+data.municipality.name,compact:true,headers:['Município','Cadastros','Lideranças'],widths:[4,1,1],rows:data.otherCities.map(c=>[c.name,fmt.format(c.total),fmt.format(c.leaders)])}]:[]),{type:'table',title:'Município não confirmado — fora da contabilidade municipal',compact:true,headers:['Situação','Cadastros'],widths:[4,1],rows:[['Aguardando confirmação de zona/seção/local',fmt.format(data.municipality.unknownTotal)]]}]:[])]}};
}
export function registrationExcludedReport(snapshot,filters={},group='other',city=''){
  const data=registrationTerritory(snapshot,filters);
  if(!data.municipality||!['other','unknown'].includes(group))throw new Error('Selecione um município em análise.');
  const selected=city?data.otherCities.find(c=>c.code===city):null;
  if(city&&!selected)throw new Error('O município escolhido não está mais neste quadro.');
  const people=[...(group==='unknown'?data.unknownPeople:selected?selected.people:data.otherPeople)].sort((a,b)=>a.city.localeCompare(b.city,'pt-BR')||a.name.localeCompare(b.name,'pt-BR',{numeric:true}));
  if(!people.length)throw new Error('Não há cadastros neste quadro para gerar o relatório.');
  const summary=territorialSummary(people),title=group==='unknown'?'Cadastros para conferência — município não confirmado':selected?'Cadastros de '+selected.name:'Cadastros de outros municípios';
  const flags=p=>[...new Set(p.records.flatMap(r=>(r.primaryFlags||[]).map(f=>f.message)))];
  return {filename:group==='unknown'?'CADASTROS_MUNICIPIO_NAO_CONFIRMADO_PA_2026.pdf':selected?'CADASTROS_MUNICIPIO_'+normalize(selected.name).replace(/[^A-Z0-9]+/g,'_')+'_PA_2026.pdf':'CADASTROS_OUTROS_MUNICIPIOS_PA_2026.pdf',report:{
    title,subtitle:snapshot.label||'Todas as lideranças autorizadas',headerSubtitle:'Cadastros fora da contabilidade municipal',generatedAt:new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),compactIndicators:true,
    meta:[['Município em análise',data.municipality.name],['Quadro',group==='unknown'?'Município não confirmado':selected?selected.name:'Todos os outros municípios'],['Escopo',snapshot.archived?'Somente arquivados':'Cadastros ativos, incluindo pendências'],['Filtros do escopo',snapshot.filterLabel||'Todas as lideranças autorizadas'],['Conteúdo',fmt.format(people.length)+' cadastros únicos — lista completa']],
    indicators:[{label:'Cadastros únicos',value:fmt.format(people.length)},{label:'Lideranças',value:fmt.format(summary.knownLeaders)},{label:'Pendências principais',value:fmt.format(people.length-summary.ready)}],
    note:'Estes cadastros ficam fora dos totais e percentuais de '+data.municipality.name+'. O arquivo contém todos os registros do quadro, incluindo os que não aparecem na prévia de 100 linhas. Títulos válidos repetidos são contados uma vez, preservando os vínculos com lideranças. O conteúdo segue o escopo e as quantidades exibidas neste quadro. Quantidade de cadastros; não representa votos apurados. '+(group==='unknown'?'Confira zona, seção e local de votação antes de atribuir um município. ':'')+(snapshot.note||''),
    blocks:[...(group==='other'?[{type:'table',title:'Resumo por município',compact:true,headers:['Município','Cadastros','Lideranças'],widths:[4,1,1],rows:(selected?[selected]:data.otherCities).map(c=>[c.name,fmt.format(c.total),fmt.format(c.leaders)])}]:[]),{type:'table',title:'Lista completa de cadastros',compact:true,headers:['Nome / título','Município / escola / bairro','Zona / seção','Lideranças / coordenação','Conferência'],widths:[3,3,1.4,3,2.6],rows:people.map(p=>[p.name+' • '+(p.title||'Título não informado'),[p.city,p.place,p.neighborhood].join(' • '),p.zone.label+' / '+p.section.label,p.affiliations.map(a=>a.leadership+' • '+(a.coordinator||'Sem coordenação')).join('; '),[p.locationConflict?'Conflito de zona, seção ou local':p.ready?'Dados principais OK':'Pendência principal',...flags(p)].join(' • ')])}]
  }};
}
export function registrationTerritoryCSV(snapshot,filters={}){
  const d=registrationTerritory(snapshot,filters),q=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  const rows=[['Tipo','Área','Município','Zona','Seção','Bairro','Coordenação','Cadastros únicos','% do recorte','Lideranças','Pendências principais']];
  for(const [type,groups]of [['MUNICÍPIO',d.cities],['ZONA',d.zones],['BAIRRO',d.neighborhoods],['LOCAL',d.places],['SEÇÃO',d.sections],['LIDERANÇA',d.leaderships]])for(const g of groups)rows.push([type,g.label,g.city,g.zone||g.zones.join(', '),g.section||'',g.neighborhood,g.coordinator,g.count,pct(g.share),g.leaders,g.primaryPending]);
  for(const [label,value] of registrationAccounting(d))rows.push(['CONTAGEM',label,'','','','','',value,'','','']);
  if(d.municipality){rows.push(['MUNICÍPIO EM ANÁLISE',d.municipality.name,d.municipality.name,'','','','',d.total,d.total?'100,0%':'—',d.knownLeaders,d.total-d.ready]);for(const c of d.otherCities)rows.push(['OUTROS MUNICÍPIOS — FORA DA CONTABILIDADE',c.name,c.name,'','','','',c.total,'',c.leaders,'']);rows.push(['MUNICÍPIO NÃO CONFIRMADO — FORA DA CONTABILIDADE','Município não confirmado','','','','','',d.municipality.unknownTotal,'','','']);}
  return '\ufeff'+rows.map(r=>r.map(v=>q(/^[=+@-]/.test(String(v))?"'"+v:v)).join(';')).join('\r\n');
}
