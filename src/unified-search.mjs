export const normalizeSearch=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const stop=new Set('A O AS OS DE DO DA DOS DAS E EM NO NA NOS NAS PARA POR VOTOS VOTO VOTACAO RESULTADO RESULTADOS CANDIDATO CANDIDATA DEPUTADO DEPUTADA ESTADUAL FEDERAL RAIO X TOP 30 HISTORICO EVOLUCAO DECLINIO COMPARAR COMPARE COMPARACAO COMPARATIVO MUNICIPIO CIDADE ZONA SECAO MAPA DR DRA PROF PROFESSOR PROFESSORA DEP'.split(' '));
const schoolStop=new Set([...stop].filter(w=>!['ESTADUAL','FEDERAL'].includes(w)).concat(['ESCOLA','COLEGIO','LOCAL','VOTACAO']));
export const schoolIntent=s=>/\b(?:ESCOLA|COLEGIO|LOCAL|EEEF|EEFM|EMEF|INSTITUTO)\b/.test(normalizeSearch(s));
function cityIn(query,catalogs){const text=normalizeSearch(query);return catalogs.flatMap(c=>c.index.municipalities).filter((c,i,a)=>a.findIndex(o=>o[0]===c[0])===i).filter(c=>new RegExp('(?:^| )(?:(?:EM|MUNICIPIO|CIDADE)(?: DE)? )'+normalizeSearch(c[1])+'(?: |$)').test(text)).sort((a,b)=>b[1].length-a[1].length)[0];}
function parts(query,catalogs,schools=false){const city=cityIn(query,catalogs),zone=normalizeSearch(query).match(/\bZONA (\d+)/)?.[1],section=normalizeSearch(query).match(/\bSECAO (\d+)/)?.[1];let text=normalizeSearch(query);if(city)text=text.replace(normalizeSearch(city[1]),'');text=text.replace(/\b(?:ZONA|SECAO) \d+/g,'');const ignored=schools?schoolStop:stop;return {city,zone,section,text,words:text.split(' ').filter(w=>w&&!ignored.has(w))};}
function ballotName(catalog,candidate){
  const data=catalog.names,record=data?.candidates?.[String(candidate[0])];
  if(data?.electionYear!==2026||data.uf!=='PA'||data.office!==catalog.office||data.turn!==1||data.source?.field!=='NM_URNA_CANDIDATO')return '';
  const identityName=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  return record&&String(record.number)===String(candidate[1])&&identityName(record.fullName)===identityName(candidate[2])?record.ballotName:'';
}
export function candidateMatches(query,catalogs){
  if(schoolIntent(query))return [];const p=parts(query,catalogs),raw=String(query).trim(),numeric=/^[\d.\s-]+$/.test(raw)?raw.replace(/\D/g,''):null;
  const numbers=[...raw.matchAll(/\b(?:\d{1,2}\.\d{3}|\d{4,5})\b/g)].map(m=>m[0].replace(/\D/g,''));if(numeric&&numeric.length>=4)numbers.push(numeric);
  const explicit=/\bFEDERAL\b/.test(p.text)?'federal':/\bESTADUAL\b/.test(p.text)?'estadual':null;
  const words=p.words.filter(w=>!/^\d+$/.test(w));let rows=[];
  for(const catalog of catalogs){if(explicit&&catalog.office!==explicit)continue;for(const c of catalog.statewide.candidates){const number=String(c[1]),ballot=ballotName(catalog,c),name=normalizeSearch(c[2]),tokenSets=[name.split(' '),...(ballot?[normalizeSearch(ballot).split(' ')]:[])],tokens=tokenSets.flat(),exactNumber=numbers.includes(number),nameMatch=words.length&&tokenSets.some(set=>words.every(w=>set.some(t=>t.startsWith(w)))),prefix=numeric&&number.startsWith(numeric);
    if(!exactNumber&&!nameMatch&&!prefix)continue;const exactName=words.length>0&&tokenSets.some(set=>words.join(' ')===set.filter(t=>!stop.has(t)).join(' '));
    rows.push({type:'candidate',office:catalog.office,candidate:c,id:String(c[0]),name:ballot||c[2],fullName:c[2],ballotName:ballot,number,city:p.city?String(p.city[0]):undefined,zone:p.zone,section:p.section,score:exactNumber?1000:exactName?800:words.length*30+(prefix?10:0),ready:exactNumber||exactName||nameMatch&&(words.length>=2||words.some(w=>w.length>=4&&tokens.includes(w)))});
  }}
  if(rows.some(r=>r.score===1000))rows=rows.filter(r=>r.score===1000);
  return rows.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'pt-BR')||a.office.localeCompare(b.office));
}
export function placeMatches(query,catalogs,places){
  if(/^[\d.\s-]+$/.test(String(query).trim()))return [];const p=parts(query,catalogs,true);if(!p.words.length)return [];
  return places.filter(r=>(!p.city||String(r.city)===String(p.city[0]))&&(!p.zone||String(r.zone)===String(Number(p.zone)))&&(!p.section||r.sections.includes(String(Number(p.section))))&&p.words.every(w=>normalizeSearch(r.place).split(' ').some(t=>t.startsWith(w)))).map(r=>({...r,type:'place',ready:p.words.length>=2||normalizeSearch(query)===normalizeSearch(r.place)||p.words.some(w=>w.length>=4&&normalizeSearch(r.place).split(' ').includes(w))})).sort((a,b)=>a.place.localeCompare(b.place,'pt-BR')||a.cityName.localeCompare(b.cityName,'pt-BR')||Number(a.zone)-Number(b.zone));
}
export function municipalCoverage(candidate,regional,region=''){
  const codes=new Set((candidate?.[6]||[]).filter(([,votes])=>Number(votes)>0).map(([code])=>String(code)));
  const allowed=new Set((regional?.municipalities||[]).filter(m=>String(m[2])===String(region)).map(m=>String(m[0])));
  return {total:codes.size,regional:region?[...codes].filter(c=>allowed.has(c)).length:null,regionName:regional?.regions?.find(r=>String(r[0])===String(region))?.[1]||'',regionalTotal:allowed.size};
}
export function initUniversalSearch(api){
  const $=id=>document.getElementById(id),input=$('guided-query-input'),list=$('guided-query-results'),status=$('guided-query-status');
  let epoch=0,timer,cursor=-1,results=[],lastApplied='',routing=false,retry=false;const catalogCache=new Map(),placeCache=new Map();
  function message(text){status.textContent=text;}
  function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');cursor=-1;}
  async function json(url){if(window.ElectionDataCache)return window.ElectionDataCache.load(url);const r=await fetch(url,{credentials:'same-origin'});if(!r.ok)throw new Error('Não foi possível consultar esta base. Conecte à internet ou prepare os dados offline.');return r.json();}
  async function manifest(office){return window.PlatformTools.manifests.get(office)||window.PlatformTools.loadManifest(office);}
  async function catalogs(){return Promise.all(['estadual','federal'].map(async office=>{const m=await manifest(office),key=office+'|'+m.active;if(!catalogCache.has(key))catalogCache.set(key,Promise.all([json(window.PlatformTools.dataURL('statewide.json',office)),json(window.PlatformTools.dataURL('index.json',office)),window.CandidateIdentity?window.CandidateIdentity.load(office).catch(()=>null):null]).then(([statewide,index,names])=>{if(statewide.electionYear!==2026||index.electionYear!==2026||statewide.office!==office||index.office!==office)throw new Error('Base de busca incompatível com 2026.');return {office,statewide,index,names};}).catch(e=>{catalogCache.delete(key);throw e;}));while(catalogCache.size>4)catalogCache.delete(catalogCache.keys().next().value);return catalogCache.get(key);}));}
  async function schools(office){const m=await manifest(office),key=office+'|'+m.active;if(!placeCache.has(key))placeCache.set(key,json(window.PlatformTools.dataURL('places.json',office)).then(p=>{if(p.electionYear!==2026||p.office!==office)throw new Error('Locais de votação de outro ano ou cargo.');return p.places;}).catch(e=>{placeCache.delete(key);throw e;}));return placeCache.get(key);}
  function coverage(){const s=api.state,candidate=s.statewide?.candidates?.find(c=>String(c[0])===String(s.candidate?.[0]));const el=$('guided-query-coverage');if(!candidate){el.hidden=true;return;}const n=municipalCoverage(candidate,s.regional,s.regionFilter);el.hidden=false;el.textContent=`${candidate[1]} • ${candidate[2]} — Municípios com votos em 2026: ${n.total} no Pará${s.regionFilter?' • '+n.regional+' de '+n.regionalTotal+' em '+n.regionName:''}.`;}
  function show(items){results=items;cursor=-1;list.replaceChildren();for(const [i,r]of items.slice(0,12).entries()){const b=document.createElement('button');b.type='button';b.id='guided-query-option-'+i;b.setAttribute('role','option');const name=document.createElement('strong'),description=document.createElement('small');if(r.type==='candidate'){name.textContent=r.number+' • '+r.name+(r.ballotName?' • Nome de urna':'');description.textContent=(r.office==='federal'?'Deputado federal':'Deputado estadual')+(r.ballotName&&r.fullName!==r.ballotName?' • '+r.fullName:'')+' • votos em '+municipalCoverage(r.candidate).total+' municípios do Pará';}else{name.textContent=r.place;description.textContent=r.cityName+' • Zona '+r.zone+(r.neighborhood?' • '+r.neighborhood:'');}b.append(name,description);b.addEventListener('pointerdown',e=>e.preventDefault());b.addEventListener('click',()=>apply(r,input.value,epoch).catch(e=>message(e.message)));list.append(b);}list.hidden=!items.length;input.setAttribute('aria-expanded',String(!!items.length));}
  function view(query){const text=normalizeSearch(query);return /MAPA/.test(text)?'map':/RAIO|TOP 30|HISTOR|EVOLUC|DECLIN/.test(text)?'xray':/COMPAR/.test(text)?'comparison':/ZONA|SECAO|ESCOLA|LOCAL/.test(text)?'territory':['overview','map','regional','xray','comparison','territory'].includes(api.state.view)?api.state.view:'overview';}
  async function apply(result,query,version){
    if(version!==epoch)return;if(routing){retry=true;return;}routing=true;close();input.setAttribute('aria-busy','true');const guard=()=>version===epoch;
    try{
      let options;if(result.type==='candidate'){options={office:result.office,city:result.city,candidate:result.id,zone:result.zone,section:result.section,view:view(query),guard};if(result.office!==api.state.office&&api.state.regionFilter)options.region=api.state.regionFilter;}
      else options={office:api.state.office,region:'',city:result.city,candidate:api.state.candidate?.[0],zone:result.zone,place:result.place,neighborhood:result.neighborhood,view:'territory',guard};
      const ok=await api.query(options);if(!guard()||ok===false)return;lastApplied=normalizeSearch(query)+'|'+result.type+'|'+(result.id||JSON.stringify([result.city,result.zone,result.place,result.neighborhood]));coverage();message(result.type==='candidate'?`${result.number} • ${result.name} • ${result.office==='federal'?'Deputado federal':'Deputado estadual'}. Filtros selecionados automaticamente.`:`${result.place} • ${result.cityName} • Zona ${result.zone}. Local selecionado nos filtros.`);
    }finally{routing=false;input.removeAttribute('aria-busy');if(retry){retry=false;find(false);}}
  }
  const special=query=>/^(?:CADASTR|PENDENC|INCOMPLET|DUPLIC|CORRELAC)/.test(normalizeSearch(query))||/ESTADUAL.*FEDERAL|FEDERAL.*ESTADUAL/.test(normalizeSearch(query));
  async function find(submit=false,event){
    const version=epoch,query=input.value.trim();if(query.length<2){close();return;}if(special(query)){close();if(submit)await api.fallback(event);return;}
    message('Consultando candidatos e locais de votação de 2026…');input.setAttribute('aria-busy','true');
    try{
      const all=await catalogs();if(version!==epoch)return;
      if(!schoolIntent(query)&&all.some(c=>c.index.municipalities.some(m=>normalizeSearch(m[1])===normalizeSearch(query)))){close();if(submit)await api.fallback(event);else message('Município identificado. Pressione Consultar para abrir os resultados.');return;}
      const candidates=candidateMatches(query,all);let places=[];
      if(schoolIntent(query)||!candidates.some(c=>c.score>=800))places=placeMatches(query,all,await schools(api.state.office));if(version!==epoch)return;
      const matches=[...candidates,...places];show(matches);
      if(/COMPAR/.test(normalizeSearch(query))&&candidates.length>=2&&candidates.length<=3&&candidates.every(c=>c.score===1000)&&new Set(candidates.map(c=>c.office)).size===1){close();const first=candidates[0];await api.query({office:first.office,candidate:first.id,candidateIds:candidates.map(c=>c.id),city:first.city,view:'comparison',guard:()=>version===epoch});coverage();message('Candidatos do mesmo cargo selecionados para comparação.');return;}
      if(matches.length===1&&(submit||matches[0].ready)){const r=matches[0],signature=normalizeSearch(query)+'|'+r.type+'|'+(r.id||JSON.stringify([r.city,r.zone,r.place,r.neighborhood]));if(submit||signature!==lastApplied)await apply(r,query,version);return;}
      if(matches.length)message(`${matches.length} correspondência(s). Escolha a opção com o cargo ou município correto${matches.length>12?'; refine a digitação para ver as demais':''}.`);
      else if(submit)await api.fallback(event);else message('Nenhum candidato ou escola localizado. Continue digitando ou informe o número completo.');
    }catch(e){if(version===epoch){close();message(e.message);}}finally{if(version===epoch&&!routing)input.removeAttribute('aria-busy');}
  }
  input.setAttribute('role','combobox');input.setAttribute('aria-controls',list.id);input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
  input.addEventListener('input',()=>{epoch++;clearTimeout(timer);close();if(!input.value.trim()){message('Digite o nome ou número do candidato, ou o nome da escola.');return;}timer=setTimeout(()=>find(false),450);});
  input.addEventListener('keydown',e=>{if(e.key==='Escape'){clearTimeout(timer);epoch++;close();return;}if(['ArrowDown','ArrowUp'].includes(e.key)&&!list.hidden){e.preventDefault();cursor=Math.max(0,Math.min(Math.min(results.length,12)-1,cursor+(e.key==='ArrowDown'?1:-1)));input.setAttribute('aria-activedescendant','guided-query-option-'+cursor);[...list.children].forEach((b,i)=>b.setAttribute('aria-selected',String(i===cursor)));}if(e.key==='Enter'&&cursor>=0&&!list.hidden){e.preventDefault();apply(results[cursor],input.value,epoch).catch(e=>message(e.message));}});
  $('guided-query-form').addEventListener('submit',e=>{e.preventDefault();clearTimeout(timer);epoch++;find(true,e);});
  document.addEventListener('pointerdown',e=>{if(!$('guided-query-form').contains(e.target))close();});
  coverage();return {coverage};
}
