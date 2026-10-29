import './election-scope.js';

self.onmessage=async({data})=>{
  const {requestId,office,year,scopeName,scopeCode,requests,roster}=data;
  const send=message=>self.postMessage({requestId,...message});
  try{
    if(year!==2026||!['estadual','federal'].includes(office)||!requests?.length)throw new Error('Consulta eleitoral inválida.');
    const aggregator=globalThis.ElectoralScope.createAggregator(scopeName,roster,scopeCode);let done=0;
    for(let offset=0;offset<requests.length;offset+=3){
    const batch=await Promise.all(requests.slice(offset,offset+3).map(async({code,url})=>{
        const response=await fetch(url,{credentials:'same-origin'});
        // The bundled API legitimately redirects to a JSON asset on this origin.
        // Check the returned content and destination rather than rejecting every redirect.
        if(!response.ok||response.headers.get('X-PA-Login-Required')||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type')||''))throw new Error('Não foi possível carregar o município. Entre novamente ou confira a conexão.');
        if(response.url&&new URL(response.url).origin!==self.location.origin)throw new Error('O município foi enviado por um endereço diferente da plataforma.');
        const city=await response.json();
        if(Number(city.y)!==year||city.o!==office||String(city.m?.[0])!==String(code))throw new Error('Base municipal de outro ano, cargo ou município.');
        return city;
    }));
    for(let i=0;i<batch.length;i++){aggregator.addCity(batch[i]);batch[i]=null;send({type:'progress',phase:'loading',done:++done,total:requests.length});}
    }
    send({type:'progress',phase:'aggregation',done,total:requests.length});
    const city=aggregator.finish();
    send({type:'ready',city});
  }catch(error){send({type:'error',message:error.message||'Não foi possível reunir os municípios.'});}
};
