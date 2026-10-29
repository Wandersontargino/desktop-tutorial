import model from '../public/quocients-model.js';
import config from '../public/results-data/live-config.json' with {type:'json'};
const cache=new Map(),pending=new Map();
const fail=(message,status)=>Object.assign(new Error(message),{status});
export async function quocientsLive(request){
  if(request.method!=='GET')throw fail('Método inválido.',405);
  const office=new URL(request.url).searchParams.get('office')||'estadual';
  if(!['estadual','federal'].includes(office))throw fail('Selecione deputado estadual ou federal.',400);
  if(cache.get(office)?.until>Date.now())return Response.json(cache.get(office).value,{headers:{'Cache-Control':'private, max-age=60'}});
  if(!pending.has(office))pending.set(office,(async()=>{
    const item=config.offices[office],source='https://resultados.tse.jus.br/oficial/'+config.cycle+'/'+item.election+'/dados/pa/pa-c'+item.code.padStart(4,'0')+'-e'+item.election.padStart(6,'0')+'-u.json';
    let r;try{r=await fetch(source,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});}catch{throw fail('Consulta ao TSE indisponível. A cópia datada continua disponível.',503);}
    if(!r.ok)throw fail('Consulta ao TSE indisponível. A cópia datada continua disponível.',503);
    if(Number(r.headers.get('content-length'))>2000000)throw fail('Arquivo oficial acima do limite.',502);
    const reader=r.body.getReader(),chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000){await reader.cancel();throw fail('Arquivo oficial acima do limite.',502);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let value;try{value=model.parseOfficial(JSON.parse(new TextDecoder().decode(bytes)),office,item.election);}catch(e){throw fail('Não foi possível conferir os quocientes: '+e.message,502);}
    value.consultedAt=new Date().toISOString();cache.set(office,{value,until:Date.now()+60000});return value;
  })().finally(()=>pending.delete(office)));
  return Response.json(await pending.get(office),{headers:{'Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff'}});
}
