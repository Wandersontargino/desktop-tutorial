const failure=message=>Object.assign(new Error(message),{code:'CRM_CONNECTION'});

// The deadline includes headers, body reading and JSON decoding. A stalled
// response must not keep a save or login waiting indefinitely.
export async function fetchCrmJSON(path,method='GET',data,{fetchImpl=fetch,timeout=25000,headers={}}={}){
  const controller=new AbortController();let timer,timedOut=false;
  const timeoutMessage='O servidor demorou para concluir a resposta. Confira a conexão e retome a operação.';
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;controller.abort();reject(failure(timeoutMessage));},timeout);});
  try{
    return await Promise.race([deadline,(async()=>{
      const response=await fetchImpl('/api/crm/'+path,{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{...headers,...(data!==undefined?{'Content-Type':'application/json'}:{})},body:data!==undefined?JSON.stringify(data):undefined});
      let value;try{value=await response.json();}catch(e){if(timedOut||e.name==='AbortError')throw failure(timeoutMessage);throw failure('Sessão indisponível. Entre novamente pela página de acesso.');}
      return {response,value};
    })()]);
  }catch(e){if(timedOut||e.name==='AbortError')throw failure(timeoutMessage);if(e.code==='CRM_CONNECTION')throw e;throw failure('Não foi possível conectar à plataforma. Confira a internet e retome a operação.');}
  finally{clearTimeout(timer);}
}
