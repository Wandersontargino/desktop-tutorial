(function(root){
  'use strict';
  const cache=new Map(),pending=new Map(),MAX=8*1024*1024;
  let bytes=0,hits=0,requests=0,generation=0;
  const eligible=path=>/^(?:\.\/|\/)(?:data\/|history-data\/|results-data\/)/.test(path)||/^\/api\/election\/(estadual|federal)\/(data\/|projection\?)/.test(path);
  async function load(path){
    if(!eligible(path))return read(path);
    if(cache.has(path)){const item=cache.get(path);cache.delete(path);cache.set(path,item);hits++;return item.value;}
    if(pending.has(path)){hits++;return pending.get(path);}
    const epoch=generation;
    const task=read(path,true).then(({value,size})=>{
      if(epoch===generation&&size<=MAX){while(cache.size&&(bytes+size>MAX||cache.size>=24)){const first=cache.keys().next().value;bytes-=cache.get(first).size;cache.delete(first);}cache.set(path,{value,size});bytes+=size;}
      return value;
    }).finally(()=>{if(pending.get(path)===task)pending.delete(path);});pending.set(path,task);return task;
  }
  async function read(path,measure=false){
    requests++;const response=await fetch(path,{credentials:'same-origin'});
    if(!response.ok||response.headers.get('X-PA-Login-Required')||!response.headers.get('content-type')?.includes('application/json'))throw Object.assign(new Error('Dados indisponíveis. Confira o acesso e a conexão.'),{status:response.status});
    const text=await response.text(),value=JSON.parse(text);
    return measure?{value,size:text.length*4}:value;
  }
  function clear(){generation++;cache.clear();pending.clear();bytes=0;}
  root.ElectionDataCache={load,clear,stats:()=>({entries:cache.size,estimatedBytes:bytes,maxEstimatedBytes:MAX,hits,requests,pending:pending.size})};
})(window);
