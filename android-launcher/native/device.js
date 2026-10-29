/* Installed-app transport. Account cookies stay in Android's private WebView jar. */
(() => {
  'use strict';
  const native=window.PADevice;if(!native)throw new Error('Este pacote precisa do aplicativo Android.');
  const originalFetch=window.fetch.bind(window),pending=new Map();let sequence=0,connected=native.isOnline(),manualOffline=false;
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  const current=()=>connected&&!manualOffline;
  Object.defineProperty(navigator,'onLine',{configurable:true,get:current});
  const status=()=>{const el=document.getElementById('connection-label');if(el)el.textContent=current()?'Online':'Offline';};
  const emit=previous=>{status();if(previous!==current())window.dispatchEvent(new Event(current()?'online':'offline'));};
  window.PANative={
    version:'2.16.0',
    network(value){const before=current();connected=!!value;emit(before);},
    offline(value){const before=current();manualOffline=!!value;emit(before);},
    reply(id,result){const request=pending.get(id);if(!request)return;pending.delete(id);request.cleanup();request.resolve(json(result.body,result.status));},
    async lock(){try{await window.CrmWorkspace?.lock();}catch{}},
  };
  window.fetch=async function(input,options={}){
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.origin!==location.origin)return originalFetch(input,options);
    if(!url.pathname.startsWith('/api/'))return originalFetch(input,options);
    const method=(options.method||input.method||'GET').toUpperCase();
    if(options.signal?.aborted)throw new DOMException('Solicitação cancelada.','AbortError');
    // Public election snapshot is installed, including all 144 municipalities.
    const election=url.pathname.match(/^\/api\/election\/(estadual|federal)(?:\/(.*))?$/);
    if(election&&(!election[2]||election[2]==='manifest')&&method==='GET')return json({revision:0,active:'bundled',versions:[],installed:true});
    if(election&&election[2]?.startsWith('data/')&&method==='GET'){
      const file=election[2].slice(5);
      if(file.includes('..')||file.includes('\\'))return json({error:'Arquivo inválido.'},400);
      return originalFetch('/data/'+(election[1]==='federal'?'federal/':'')+file,{signal:options.signal});
    }
    if(url.pathname==='/api/favorites'){
      let saved;try{saved=JSON.parse(localStorage.getItem('pa-native-favorites'))||{revision:0,items:[]};}catch{saved={revision:0,items:[]};}
      if(method==='GET')return json(saved);
      if(method==='PUT'){const value=JSON.parse(options.body);if(value.revision!==saved.revision)return json({error:'A lista mudou. Reabra as consultas.'},409);if(!Array.isArray(value.items)||value.items.length>50)return json({error:'Salve até 50 consultas.'},400);saved={revision:saved.revision+1,items:value.items};localStorage.setItem('pa-native-favorites',JSON.stringify(saved));return json(saved);}
      return json({error:'Método inválido.'},405);
    }
    if(!current())throw new TypeError('Sem conexão. A cópia protegida continua disponível neste aparelho.');
    const id=String(++sequence),headers=new Headers(options.headers||{});
    const response=await new Promise((resolve,reject)=>{
      const onAbort=()=>{pending.delete(id);reject(new DOMException('Solicitação cancelada.','AbortError'));};
      pending.set(id,{resolve,reject,cleanup:()=>options.signal?.removeEventListener('abort',onAbort)});
      options.signal?.addEventListener('abort',onAbort,{once:true});
      try{native.request(id,JSON.stringify({path:url.pathname+url.search,method,body:options.body||'',revision:headers.get('X-PA-Known-Revision')||''}));}
      catch(error){pending.delete(id);options.signal?.removeEventListener('abort',onAbort);reject(error);}
    });
    if(url.pathname==='/api/crm/session'&&response.ok){const info=await response.clone().json();if(info.user?.email)try{localStorage.setItem('pa-native-account-email',info.user.email);}catch{}}
    return response;
  };
  async function saveAnchor(anchor){
    const response=await originalFetch(anchor.href),blob=await response.blob();
    if(blob.size>30*1024*1024)throw new Error('O arquivo excede 30 MB. Gere um relatório menor.');
    const reader=new FileReader();reader.onload=()=>native.saveFile(anchor.download||'arquivo-eleitoral',blob.type||'application/octet-stream',String(reader.result).split(',')[1]);reader.readAsDataURL(blob);
  }
  const anchorClick=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){if(this.download&&/^(blob:|data:)/.test(this.href)){saveAnchor(this).catch(e=>alert(e.message));return;}return anchorClick.call(this);};
  document.addEventListener('click',event=>{const a=event.target.closest?.('a[download]');if(a&&/^(blob:|data:)/.test(a.href)){event.preventDefault();saveAnchor(a).catch(e=>alert(e.message));}});
  window.print=()=>native.print();
  const installedState=()=>({installed:true,ready:true,preparedAt:'2026-10-29T00:00:00Z',at:'2026-10-29T00:00:00Z',versions:{estadual:'bundled',federal:'bundled'},busy:false,storageAvailable:true,freshness:'ready'});
  window.OfflineManager={getState:installedState,prepare:async()=>{},init(){
    const $=id=>document.getElementById(id);
    $('install-app').textContent='Android 2.16 • instalado';$('install-app').disabled=true;
    $('prepare-offline').textContent='Conectar base';$('prepare-offline').addEventListener('click',async()=>{await window.PANative.lock();manualOffline=false;status();native.authorize();});
    const mode=document.createElement('button');mode.className='button secondary';mode.id='native-offline-mode';mode.textContent='Usar cópia offline';
    mode.addEventListener('click',()=>{window.PANative.offline(true);$('offline-status').textContent='Cópia offline selecionada. Entre com o e-mail e a senha usados neste aparelho. Conectar base retoma a sincronização.';const email=$('crm-email');email.readOnly=false;$('crm-confirm-wrap').hidden=true;$('crm-confirm').required=false;$('crm-mfa-wrap').hidden=true;});
    $('prepare-offline').after(mode);
    $('offline-status').textContent='Telas e dados eleitorais instalados. Conecte sua conta uma vez para preparar os cadastros protegidos. Sincronização ocorre com o aplicativo aberto e as alterações aprovadas.';
    $('access-help').addEventListener('click',()=>alert('1. Conectar base: autorize a conta privada e entre com a senha da plataforma.\n2. Sem internet: use a cópia protegida e a mesma senha, por até 7 dias desde a última validação.\n3. Confira e aprove as alterações. Ao voltar a conexão com o app aberto, o envio é retomado. Divergências continuam para revisão.\n4. Relatórios são salvos na pasta escolhida no Android. Atualizações da interface chegam por um novo APK.'));
    if(!current()){$('crm-email').readOnly=false;$('crm-mfa-wrap').hidden=true;}
    try{if(!$('crm-email').value)$('crm-email').value=localStorage.getItem('pa-native-account-email')||'';}catch{}
    $('crm-signout').addEventListener('click',async event=>{event.preventDefault();await window.PANative.lock();native.signOut();});
    for(const event of ['online','offline'])window.addEventListener(event,status);status();
    const favorite=$('favorite-status');if(favorite)new MutationObserver(()=>{if(favorite.textContent.includes('outro aparelho'))favorite.textContent='Consultas salvas neste aplicativo.';}).observe(favorite,{childList:true});
    // Base imports and activation belong to the central website; APK public data is versioned.
    const controls=['base-office','base-encoding','base-votes-file','base-locations-file','base-preview-button','base-apply-button','base-restore-button'];
    for(const id of controls)if($(id))$(id).disabled=true;
    if($('base-status'))$('base-status').textContent='O aplicativo usa a base eleitoral incluída no APK. Importe ou ative novas bases no site central; instale uma atualização do APK para renovar a cópia eleitoral pública.';
  }};
})();
