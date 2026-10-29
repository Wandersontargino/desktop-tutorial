import config from '../public/results-data/live-config.json' with {type:'json'};
const cache=new Map(),pending=new Map();
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const number=v=>/^\d{1,5}$/.test(String(v))&&Number(v)>0?String(Number(v)):'';
const base='https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220';
async function officialJSON(url,limit=6000000){
  const saved=cache.get(url);if(saved?.until>Date.now())return saved.value;
  if(!pending.has(url))pending.set(url,(async()=>{
    let r;try{r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});}catch{throw fail('Consulta ao TSE temporariamente indisponível.',503);}
    if(!r.ok)throw fail(r.status===404?'O TSE ainda não disponibilizou os arquivos desta seção.':'Consulta ao TSE temporariamente indisponível.',r.status===404?404:503);
    if(Number(r.headers.get('content-length'))>limit)throw fail('Arquivo oficial acima do limite.',502);
    const reader=r.body.getReader(),chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw fail('Arquivo oficial acima do limite.',502);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let value;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{throw fail('Arquivo oficial inválido.',502);}
    if(cache.size>128)cache.clear();cache.set(url,{value,until:Date.now()+300000});return value;
  })().finally(()=>pending.delete(url)));
  return pending.get(url);
}
export function findSection(data,municipality,zone,section){
  if(data?.f!=='o'||String(data.cdp)!=='3220')throw fail('Configuração de outro pleito ou ambiente.',502);
  const mu=data.abr?.find(a=>a.cd==='pa')?.mu?.find(m=>number(m.cd)===municipality),z=mu?.zon?.find(z=>number(z.cd)===zone),record=z?.sec?.find(s=>number(s.ns)===section);
  if(!record)throw fail('Seção não encontrada na configuração oficial de 2026 deste município.',404);
  const principal=number(record.nsp)||section,main=z.sec.find(s=>number(s.ns)===principal);
  if(!main)throw fail('Seção principal não encontrada na fonte oficial.',502);
  return {municipality:String(mu.cd),zone:String(z.cd),section,principal,record:main};
}
export function sectionFiles(aux,directory){
  if(aux?.f!=='o')throw fail('Arquivo de seção de outro ambiente.',502);
  const files=[];
  for(const group of aux.hashes||[]){
    if(!/^[a-fA-F0-9]{32,128}$/.test(group.hash))continue;
    for(const file of group.arq||[]){
      if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,220}$/.test(file.nm)||!(file.tp==='bu'||/(?:\.bu|\.bua|\.imgbu|\.pdf)$/i.test(file.nm)))continue;
      files.push({name:String(file.nm),type:String(file.tp||''),status:String(group.st||''),receivedAt:[group.dr,group.hr].filter(Boolean).join(' '),url:directory+'/'+group.hash+'/'+file.nm});
    }
  }
  return files.slice(0,30);
}
export async function tseSection(request){
  if(request.method!=='GET')throw fail('Método inválido.',405);
  const params=new URL(request.url).searchParams,municipality=number(params.get('municipality')),zone=number(params.get('zone')),section=number(params.get('section'));
  if(!municipality||!config.zones[municipality]||!zone||!config.zones[municipality].includes(zone)||!section||+section>9999)throw fail('Selecione município, zona e seção válidos do Pará.');
  const index=await officialJSON(base+'/config/pa/pa-p003220-cs.json'),match=findSection(index,municipality,zone,section);
  const m=match.municipality.padStart(5,'0'),z=match.zone.padStart(4,'0'),s=match.principal.padStart(4,'0'),directory=base+'/dados/pa/'+m+'/'+z+'/'+s;
  const source=directory+'/p003220-pa-m'+m+'-z'+z+'-s'+s+'-aux.json';
  const aux=await officialJSON(source,300000);
  return Response.json({electionYear:2026,turn:1,uf:'PA',phase:'oficial',municipality,zone,section,principal:match.principal,generatedAt:aux.dg+' '+aux.hg,status:String(aux.st||'Situação não informada'),source,files:sectionFiles(aux,directory)},{headers:{'Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff'}});
}
