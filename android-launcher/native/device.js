/* Installed-app transport. Account cookies stay in Android's private WebView jar. */
(() => {
  'use strict';
  const native=window.PADevice;if(!native)throw new Error('Este pacote precisa do aplicativo Android.');
  const originalFetch=window.fetch.bind(window),pending=new Map();let sequence=0,connected=native.isOnline(),manualOffline=false;
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  const current=()=>connected&&!manualOffline;
  Object.defineProperty(navigator,'onLine',{configurable:true,get:current});
  let accountAuthorized=false,authorizationPending=false,authorizationMessage='';
  function renderAccountAccess(){
    const panel=document.getElementById('native-account-access');if(!panel)return;
    const button=document.getElementById('native-connect-base'),message=document.getElementById('native-account-status');
    panel.dataset.state=!connected?'offline':accountAuthorized?'authorized':authorizationPending?'connecting':'required';
    button.disabled=!connected||authorizationPending;
    document.getElementById('native-account-title').textContent=accountAuthorized?'1. Conta autorizada neste aparelho':'1. Autorize este aparelho';
    message.textContent=!connected?'Conecte-se à internet para autorizar este aparelho. Se já preparou a base aqui, use Usar cópia offline.':manualOffline?'Você está usando a cópia offline. Conectar base permite autorizar sua conta e voltar à base central.':accountAuthorized?'Conta autorizada. Agora entre com a senha da base abaixo.':authorizationPending?'Conclua o acesso à sua conta na janela de autorização.':authorizationMessage||'Toque em Conectar base e entre com a mesma conta do ChatGPT que acessa a plataforma privada. Depois, use a senha da base abaixo.';
  }
  const status=()=>{const el=document.getElementById('connection-label');if(el)el.textContent=current()?'Online':'Offline';renderAccountAccess();};
  const emit=previous=>{status();if(previous!==current())window.dispatchEvent(new Event(current()?'online':'offline'));};
  async function connectBase(){
    if(!connected||authorizationPending){renderAccountAccess();return;}
    authorizationPending=true;authorizationMessage='';renderAccountAccess();
    try{await window.PANative.lock();manualOffline=false;status();native.authorize();}
    catch{authorizationPending=false;authorizationMessage='Não foi possível abrir a autorização. Toque em Conectar base para tentar novamente.';renderAccountAccess();}
  }
  window.PANative={
    version:'2.16.1',
    network(value){const before=current();connected=!!value;emit(before);},
    offline(value){const before=current();manualOffline=!!value;emit(before);},
    reply(id,result){const request=pending.get(id);if(!request)return;pending.delete(id);request.cleanup();request.resolve(json(result.body,result.status));},
    async lock(){try{await window.CrmWorkspace?.lock();}catch{}},
    authorizationClosed(){authorizationPending=false;authorizationMessage='A autorização não foi concluída. Toque em Conectar base para tentar novamente.';renderAccountAccess();},
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
    if(url.pathname==='/api/crm/session'||url.pathname.startsWith('/api/crm/')&&[401,403].includes(response.status)){
      const info=await response.clone().json();
      if(url.pathname==='/api/crm/session'&&method==='GET'&&response.ok&&info.user){
        accountAuthorized=true;authorizationPending=false;authorizationMessage='';
        if(info.user.email)try{localStorage.setItem('pa-native-account-email',info.user.email);}catch{}
      }else if(info.requiresDeviceAuthorization===true||String(info.error||'').startsWith('Autorize este aparelho em Conectar base')){
        accountAuthorized=false;authorizationPending=false;authorizationMessage='É preciso autorizar sua conta neste aparelho. Use Conectar base aqui acima e depois entre com a senha da base.';
      }
      renderAccountAccess();
    }
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
    $('install-app').textContent='Android 2.16.1 • instalado';$('install-app').disabled=true;
    $('prepare-offline').textContent='Conectar base';$('prepare-offline').addEventListener('click',connectBase);
    const form=$('crm-auth');
    if(form&&!$('native-account-access')){
      const style=document.createElement('style');style.textContent='.native-account-access{box-sizing:border-box;display:grid;gap:10px;min-width:0;margin:12px 0;padding:16px;border:2px solid #2358ed;border-radius:14px;background:#eef3ff;color:#16336d}.native-account-access h4,.native-account-access p{margin:0;overflow-wrap:anywhere}.native-account-access h4{font-size:1.05rem}.native-account-access p{line-height:1.5}.native-account-access .button{box-sizing:border-box;width:100%;min-height:48px;white-space:normal}.native-account-access[data-state="authorized"]{border-color:#25834b;background:#eef8f0;color:#17532c}.native-login-step{font-weight:700;margin:16px 0 8px}';document.head.append(style);
      const panel=document.createElement('section');panel.id='native-account-access';panel.className='native-account-access';panel.setAttribute('aria-labelledby','native-account-title');
      panel.innerHTML='<h4 id="native-account-title">1. Autorize este aparelho</h4><p id="native-account-status" role="status" aria-live="polite"></p><button id="native-connect-base" class="button primary" type="button" aria-describedby="native-account-status">Conectar base</button>';
      const step=document.createElement('p');step.className='native-login-step';step.id='native-login-step';step.textContent='2. Entre com a senha da base';form.before(panel,step);
      $('native-connect-base').addEventListener('click',connectBase);
    }
    const mode=document.createElement('button');mode.className='button secondary';mode.id='native-offline-mode';mode.textContent='Usar cópia offline';
    mode.addEventListener('click',()=>{window.PANative.offline(true);$('offline-status').textContent='Cópia offline selecionada. Entre com o e-mail e a senha usados neste aparelho. Conectar base retoma a sincronização.';const email=$('crm-email');email.readOnly=false;$('crm-confirm-wrap').hidden=true;$('crm-confirm').required=false;$('crm-mfa-wrap').hidden=true;});
    $('prepare-offline').after(mode);
    $('offline-status').textContent='Telas e dados eleitorais instalados. Conecte sua conta uma vez para preparar os cadastros protegidos. Sincronização ocorre com o aplicativo aberto e as alterações aprovadas.';
    $('access-help').addEventListener('click',()=>alert('1. Conectar base: autorize a conta privada e entre com a senha da plataforma.\n2. Sem internet: use a cópia protegida e a mesma senha, por até 7 dias desde a última validação.\n3. Confira e aprove as alterações. Ao voltar a conexão com o app aberto, o envio é retomado. Divergências continuam para revisão.\n4. Relatórios são salvos na pasta escolhida no Android. Atualizações da interface chegam por um novo APK.'));
    if(!current()){$('crm-email').readOnly=false;$('crm-mfa-wrap').hidden=true;}
    try{if(!$('crm-email').value)$('crm-email').value=localStorage.getItem('pa-native-account-email')||'';}catch{}
    $('crm-signout').addEventListener('click',async event=>{event.preventDefault();await window.PANative.lock();native.signOut();});
    let wasUnlocked=false;document.addEventListener('crm:state-change',()=>{const unlocked=!!window.CrmWorkspace?.isUnlocked();const opened=unlocked&&!wasUnlocked;wasUnlocked=unlocked;if(opened&&current())queueMicrotask(()=>window.dispatchEvent(new Event('online')));});
    for(const event of ['online','offline'])window.addEventListener(event,status);status();
    const favorite=$('favorite-status');if(favorite)new MutationObserver(()=>{if(favorite.textContent.includes('outro aparelho'))favorite.textContent='Consultas salvas neste aplicativo.';}).observe(favorite,{childList:true});
    // Base imports and activation belong to the central website; APK public data is versioned.
    const controls=['base-office','base-encoding','base-votes-file','base-locations-file','base-preview-button','base-apply-button','base-restore-button'];
    for(const id of controls)if($(id))$(id).disabled=true;
    if($('base-status'))$('base-status').textContent='O aplicativo usa a base eleitoral incluída no APK. Importe ou ative novas bases no site central; instale uma atualização do APK para renovar a cópia eleitoral pública.';
  }};
})();
