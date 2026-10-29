(function(root){
  'use strict';
  let registration,installEvent,busy=false;
  const el=id=>document.getElementById(id),stampKey='pa-offline-ready-20261028-107';
  function state(){let preparedAt='',versions=null;try{preparedAt=localStorage.getItem(stampKey)||'';versions=JSON.parse(localStorage.getItem(stampKey+'-versions')||'null');}catch{}const known=root.PlatformTools?.manifests;let stale=false,matched=0;for(const office of ['estadual','federal']){const active=known?.get(office)?.active;if(active&&versions?.[office]){matched++;if(active!==versions[office])stale=true;}}return {busy,preparedAt,available:!!registration,versions,freshness:stale?'stale':preparedAt&&versions&&matched===2?'ready':preparedAt?'unknown':'notPrepared'};}
  const say=text=>{if(el('offline-status'))el('offline-status').textContent=text;};
  const installed=()=>root.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
  function installedUI(){if(!el('install-app'))return;el('install-app').disabled=Boolean(installed());el('install-app').textContent=installed()?'Aplicativo instalado':'Instalar aplicativo';}
  function guide(note=''){if(el('app-access-install-note'))el('app-access-install-note').textContent=note;const dialog=el('app-access-dialog');if(dialog&&!dialog.open)dialog.showModal();}
  function ready(at){say('Cópia eleitoral preparada neste aparelho em '+new Date(at).toLocaleString('pt-BR')+'. Cadastros protegidos precisam da senha.');}
  async function init(){
    root.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;installedUI();});
    root.addEventListener('appinstalled',()=>{installEvent=null;if(el('install-app')){el('install-app').textContent='Aplicativo instalado';el('install-app').disabled=true;}say('Aplicativo instalado. Prepare os dados para usar sem internet.');});
    installedUI();el('access-help')?.addEventListener('click',()=>guide());
    el('install-app')?.addEventListener('click',async()=>{if(!installEvent)return guide('Se o navegador não oferecer a instalação automática, use as instruções acima.');const event=installEvent;installEvent=null;try{await event.prompt();const choice=await event.userChoice;if(choice.outcome==='accepted')say('Instalação solicitada. Aguarde a confirmação do navegador.');else say('Instalação adiada. Você pode tentar pelo menu do navegador.');}catch{guide('Use a opção de instalação no menu do navegador.');}});
    const status=()=>{if(el('connection-label'))el('connection-label').textContent=navigator.onLine?'Online':'Offline';};status();root.addEventListener('online',status);root.addEventListener('offline',status);
    try{const saved=localStorage.getItem(stampKey);if(saved)ready(saved);}catch{}
    el('prepare-offline')?.addEventListener('click',prepare);
    if(!('serviceWorker' in navigator)){say('Este navegador não oferece o modo offline. Abra no Chrome, Edge ou Safari atualizado.');return;}
    navigator.serviceWorker.addEventListener('message',({data})=>{
      if(data.type==='offline-progress'){say('Preparando consultas offline: '+data.done+' de '+data.total+' arquivos.');const progress=el('offline-progress');if(progress){progress.hidden=false;progress.max=data.total;progress.value=data.done;}}
      if(data.type==='offline-done'){try{localStorage.setItem(stampKey,data.at);}catch{}ready(data.at);}
      if(data.type==='offline-error')say(data.message);
    });
    try{registration=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});await navigator.serviceWorker.ready;}catch{say('Este navegador não permitiu preparar o modo offline.');}
  }
  async function prepare(){
    if(busy)return;if(!navigator.onLine)return say('Conecte à internet para preparar ou atualizar a cópia deste aparelho.');if(!registration)return say('O modo offline ainda não está pronto. Reabra a plataforma e tente novamente.');
    busy=true;const button=el('prepare-offline'),progress=el('offline-progress');button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Preparando…';say('Conferindo as bases deste aparelho.');if(progress){progress.hidden=false;progress.value=0;}
    try{
      const manifests={};for(const office of ['estadual','federal']){const response=await fetch('/api/election/'+office+'/manifest',{cache:'no-store'});if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Entre na sua conta antes de preparar os dados.');manifests[office]=await response.json();}
      const worker=registration.active;if(!worker)throw new Error('Reabra a plataforma para concluir a instalação.');
      await new Promise((resolve,reject)=>{const channel=new MessageChannel();channel.port1.onmessage=({data})=>{channel.port1.close();if(data.ok)resolve();else reject(new Error(data.error));};worker.postMessage({type:'prepare-offline',manifests},[channel.port2]);});
      try{localStorage.setItem(stampKey+'-versions',JSON.stringify(Object.fromEntries(Object.entries(manifests).map(([office,value])=>[office,value.active]))));}catch{}
    }catch(e){say(e.message);}finally{busy=false;button.disabled=false;button.removeAttribute('aria-busy');button.textContent='Preparar uso offline';if(progress)progress.hidden=true;}
  }
  root.OfflineManager={init,prepare,getState:state};
})(window);
