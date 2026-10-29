import config from '../public/results-data/live-config.json' with {type:'json'};
const cache=new Map(),pending=new Map();
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const integer=value=>{if(!/^\d+$/.test(String(value)))throw fail('Indicador inválido recebido do TSE.',502);return Number(value);};
export function parseProgress(data,office,municipality='',zone=''){
  const election=config.offices[office];
  const scope=zone?'zona':municipality?'mu':'uf',code=zone?String(Number(zone)):municipality?String(Number(municipality)):'pa';
  // EA20 dt/ht describe the last totalization, which can occur after election day.
  if(!election||String(data.ele)!==election.election||data.t!=='1'||data.f!=='o'||data.sup!=='n'||!/^\d{2}\/\d{2}\/2026$/.test(data.dt)||data.tpabr!==scope||(scope==='uf'?data.cdabr!=='pa':String(Number(data.cdabr))!==code)||!data.carg?.some(c=>String(c.cd)===election.code))throw fail('O TSE retornou dados de outra eleição ou recorte.',502);
  if(!/^\d{2}\/\d{2}\/2026$/.test(data.dg)||!/^\d{2}:\d{2}:\d{2}$/.test(data.hg)||!/^\d{2}:\d{2}:\d{2}$/.test(data.ht))throw fail('Data de geração inválida no arquivo do TSE.',502);
  const total=integer(data.s.ts),counted=integer(data.s.st);if(counted>total)throw fail('Total de seções inválido.',502);
  const optional=v=>v==null?null:integer(v),votes=data.v||{};
  const voteTotals=Object.fromEntries(Object.entries({total:'tv',valid:'vv',nominal:'vnom',party:'vl',annulled:'van',subJudice:'vansj',blank:'vb',null:'tvn'}).map(([label,key])=>[label,optional(votes[key])]));
  if([voteTotals.valid,voteTotals.nominal,voteTotals.party].every(v=>v!==null)&&voteTotals.valid!==voteTotals.nominal+voteTotals.party)throw fail('Totais válidos divergentes no arquivo do TSE.',502);
  const cargo=data.carg.find(c=>String(c.cd)===election.code),candidates=[];
  for(const group of cargo.agr||[])for(const party of group.par||[])for(const c of party.cand||[])candidates.push({id:String(c.sqcand||''),number:String(c.n||''),fullName:String(c.nm||''),ballotName:String(c.nmu||''),party:String(party.sg||''),destination:String(c.dvt||''),status:String(c.st||'')});
  return {electionYear:2026,turn:1,uf:'PA',phase:'oficial',election:election.election,office,municipality,zone,scope,generatedAt:data.dg+' '+data.hg,totalizedAt:data.dt+' '+data.ht,generationId:String(data.idg||''),final:data.tf==='s'&&data.and==='f',sections:total,counted,notCounted:total-counted,notInstalled:optional(data.s.sni),percentage:total?counted/total*100:null,voteTotals,candidates,consultedAt:new Date().toISOString()};
}
export async function resultsLive(request){
  if(request.method!=='GET')throw fail('Método inválido.',405);
  const params=new URL(request.url).searchParams,office=params.get('office')||'estadual',municipality=params.get('municipality')||'',zone=params.get('zone')||'';
  const item=config.offices[office];if(!item)throw fail('Cargo inválido.');
  if(municipality&&!config.zones[municipality])throw fail('Município inválido.');
  if(zone&&(!municipality||!config.zones[municipality].includes(zone)))throw fail('Selecione município e zona válidos.');
  const key=[office,municipality,zone].join('|'),saved=cache.get(key);
  if(saved&&saved.until>Date.now())return Response.json(saved.result,{headers:{'Cache-Control':'private, max-age=30'}});
  if(!pending.has(key))pending.set(key,(async()=>{
    const name='pa'+(municipality?municipality.padStart(5,'0'):'')+(zone?'-z'+zone.padStart(4,'0'):'')+'-c'+item.code.padStart(4,'0')+'-e'+item.election.padStart(6,'0')+'-u.json';
    const source='https://resultados.tse.jus.br/oficial/'+config.cycle+'/'+item.election+'/dados/pa/'+name;
    let response;
    try{response=await fetch(source,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'},redirect:'manual'});}catch{throw fail('A consulta ao TSE está temporariamente indisponível. Tente novamente em instantes.',503);}
    if(!response.ok)throw fail('A consulta ao TSE está temporariamente indisponível.',503);
    const text=await response.text();if(text.length>2000000)throw fail('Resposta oficial acima do limite.',502);
    const result={...parseProgress(JSON.parse(text),office,municipality,zone),source};
    if(cache.size>512)cache.clear();cache.set(key,{result,until:Date.now()+60000});return result;
  })().finally(()=>pending.delete(key)));
  return Response.json(await pending.get(key),{headers:{'Cache-Control':'private, max-age=30','X-Content-Type-Options':'nosniff'}});
}
