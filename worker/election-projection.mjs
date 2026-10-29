import Paired from '../public/paired-analysis.js';

// Only public election aggregates are stored here, never CRM records or identities.
export async function electionProjection(request,env,office){
  const url=new URL(request.url),code=url.searchParams.get('municipality')||'',id=url.searchParams.get('candidate')||'',version=url.searchParams.get('version')||'bundled';
  const error=(message,status=400)=>Object.assign(new Error(message),{status});
  if(request.method!=='GET')throw error('Método inválido.',405);
  if(!request.headers.get('oai-authenticated-user-id'))throw error('Entre na conta para consultar a votação.',401);
  if(!/^\d{4,5}$/.test(code)||!/^\d{1,20}$/.test(id)||!TEMPLATES[office].municipalities.some(m=>String(m[0])===code))throw error('Município ou candidatura inválida.');
  if(version!=='bundled'&&!/^[a-f0-9-]{36}$/.test(version))throw error('Versão inválida.');
  const selected=url.searchParams.get('sections')||'';
  if(selected.length>16000||selected&&!/^[1-9]\d{0,2}-[1-9]\d{0,3}(?:,[1-9]\d{0,2}-[1-9]\d{0,3})*$/.test(selected))throw error('Seções inválidas.');
  const prefix=`elections/${office}/versions/${version}/`;
  if(version!=='bundled'&&!await env.BUCKET.get(prefix+'complete.json'))throw error('Versão não concluída.',404);
  const key=`elections/${office}/projections/v1/${version}/${id}/${code}.json`;
  const cached=await env.BUCKET.get(key);let rows;
  if(cached)rows=await cached.json();
  else {
    let city;
    if(version==='bundled'){
      const response=await env.ASSETS.fetch(new Request(new URL(`/data/${office==='federal'?'federal/':''}${code}.json`,url.origin)));
      if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw error('Município indisponível.',503);
      city=await response.json();
    }else{const object=await env.BUCKET.get(prefix+code+'.json');if(!object)throw error('Município indisponível nesta versão.',404);city=await object.json();}
    if(String(city.m?.[0])!==code||city.y!==2026||city.o!==office)throw error('Base municipal incompatível.',409);
    if(!CANDIDATE_CATALOG[office].some(c=>String(c[0])===id)&&!city.c.some(c=>String(c[0])===id))throw error('Candidatura não localizada.',404);
    rows=Paired.project(city,id,office);
    await env.BUCKET.put(key,JSON.stringify(rows),{httpMetadata:{contentType:'application/json'}});
  }
  if(selected){const keys=new Set(selected.split(','));rows=rows.filter(r=>keys.has(r.zone+'-'+r.section));}
  return new Response(JSON.stringify({year:2026,office,municipality:code,candidate:id,version,rows}),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
}
