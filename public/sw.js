const VERSION='pa-2026-platform-20261028-107',SHELL=VERSION+'-shell',DATA='pa-2026-platform-public-data-v1';
const BUNDLED_REVISION='__PA_BUNDLED_REVISION__';
const immutableElection=url=>url.origin===self.location.origin&&/^\/api\/election\/(estadual|federal)\/data\//.test(url.pathname)&&url.searchParams.has('version')&&!!url.searchParams.get('version');
const reusableElection=(url,response)=>response?.ok&&!response.redirected&&!response.headers.get('X-PA-Login-Required')&&response.headers.get('content-type')?.includes('application/json')&&(url.searchParams.get('version')!=='bundled'||response.headers.get('X-PA-Bundled-Revision')===BUNDLED_REVISION);
function preparedResponse(path,response){if(new URL(path,self.location.origin).searchParams.get('version')!=='bundled')return response;const headers=new Headers(response.headers);headers.set('X-PA-Bundled-Revision',BUNDLED_REVISION);return new Response(response.body,{status:response.status,headers});}
const shell=['/quocients-model.js','/quocients.js','/results-data/quocients-estadual-2026.json','/results-data/quocients-federal-2026.json','/','/index.html','/styles.css','/platform.css','/dashboard-theme.css','/home.js','/workspace-pages.js','/candidate-apuration.js','/school-picker.js','/crossing-model.js','/crossing-view.js','/checklist-final.html','/platform-release.json','/platform-health.js','/platform-audit.js','/zone-history-model.js','/zone-history.js','/zone-107-crosswalk.json','/app.js','/data-cache.js','/platform-tools.js','/election-scope.js','/municipality-selection.js','/scope-worker.mjs','/candidate-identity.js','/paired-analysis.js','/paired-view.js','/report-pdf.js','/report-center.js','/election-archive-model.js','/election-archive.js','/municipal-report.js','/comparison-report.js','/comparison-reading.js','/comparison-territory.js','/crm-workspace.js','/electoral-map.js','/map-model.js','/pa-municipal-map.json','/ananindeua-neighborhood-map.json','/ananindeua-neighborhood-map.webp','/crm-model.mjs','/secure-vault.mjs','/offline-manager.js','/searchable-select.js','/vendor/jszip.min.js','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
shell.push('/council-register-model.js','/council-extras.js','/council-data/ananindeua-2019-summary.json','/council.css','/council-model.js','/council.js','/council-data/ananindeua-2023.json');
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(SHELL);let next=0;await Promise.all(Array.from({length:4},async()=>{while(next<shell.length){const path=shell[next++],response=await fetch(path,{credentials:'same-origin',cache:'reload'});if(!response.ok||response.redirected||response.headers.get('X-PA-Login-Required'))throw new Error('Acesso autenticado necessário para instalar.');await cache.put(path,response);}}));await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys(),data=await caches.open(DATA);
  // Immutable electoral versions survive interface upgrades. Never carry CRM
  // responses, unversioned code or a manifest into a newer application shell.
  for(const key of keys)if(/^pa-2026-platform-\d+-\d+-data$/.test(key)){
    const old=await caches.open(key);for(const request of await old.keys())if(immutableElection(new URL(request.url))&&!await data.match(request)){const response=await old.match(request);if(reusableElection(new URL(request.url),response))await data.put(request,response);}
  }
  await self.clients.claim();for(const key of keys)if(key.startsWith('pa-2026-platform-')&&key!==SHELL&&key!==DATA&&!key.startsWith(DATA+'-stage-'))await caches.delete(key);
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
  const isData=(url.pathname.startsWith('/data/')||url.pathname.startsWith('/history-data/')||url.pathname.startsWith('/results-data/'))||/^\/api\/election\/(estadual|federal)\/(data\/|manifest$)/.test(url.pathname)||url.pathname==='/locations-2026.json';
  const isShell=shell.includes(url.pathname)||(url.pathname.startsWith('/vendor/ocr/')||url.pathname.startsWith('/vendor/pdf/'))||['/import-worker.mjs','/pdf-runtime.js','/ocr-runtime.js','/election-model.mjs','/results-model.js','/results.js','/tse-model.js','/tse-resources.js','/comparison-reading.js'].includes(url.pathname);
  if(!isData&&!isShell&&request.mode!=='navigate')return;
  event.respondWith((async()=>{
    try{
      const response=await fetch(request);
      if(response.headers.get('X-PA-Login-Required'))return response;
      if(!response.ok)throw new Error('Rede indisponível');
      // Only public electoral datasets and application code are cached.
      // Never cache CRM, sessions, favorites, submissions, or identity responses.
      if(!response.redirected&&isShell){const cache=await caches.open(SHELL);await cache.put(url.pathname,response.clone());}
      return response;
    }catch{
      if(isData){const cache=await caches.open(DATA),cached=await cache.match(request);if(cached&&(!immutableElection(url)||reusableElection(url,cached)))return cached;}
      const cache=await caches.open(SHELL),cached=await cache.match(url.pathname);if(cached)return cached;
      if(isShell){const prepared=await (await caches.open(DATA)).match(url.pathname);if(prepared)return prepared;}
      if(request.mode==='navigate'){const app=await cache.match('/');if(app)return app;}
      return new Response('Este arquivo ainda não foi preparado para uso offline.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  })());
});
self.addEventListener('message',event=>{
  if(event.data.type!=='prepare-offline')return;
  event.waitUntil((async()=>{
    const notify=data=>event.source?.postMessage(data),stageName=DATA+'-stage-'+Date.now();
    try{
      const response=await fetch('/offline-files.json',{cache:'no-store'});if(!response.ok)throw new Error('Lista de arquivos indisponível.');const files=await response.json();
      const stage=await caches.open(stageName),previous=await caches.open(DATA),manifests=event.data.manifests,tasks=[...files.assets];
      for(const office of ['estadual','federal'])for(const file of files.electionFiles[office])tasks.push(`/api/election/${office}/data/${file}?version=${encodeURIComponent(manifests[office].active)}`);
      let next=0,done=0;await Promise.all(Array.from({length:3},async()=>{while(next<tasks.length){const path=tasks[next++],url=new URL(path,self.location.origin),cached=immutableElection(url)?await previous.match(path):null,r=reusableElection(url,cached)?cached:await fetch(path,{credentials:'same-origin'});if(!r.ok||r.redirected||r.headers.get('X-PA-Login-Required'))throw new Error('Arquivo indisponível: '+path);if((/^\/api\/election/.test(path)||path.startsWith('/history-data/'))&&!r.headers.get('content-type')?.includes('application/json'))throw new Error('Sessão expirada. Entre novamente antes de preparar.');await stage.put(path,preparedResponse(path,r));notify({type:'offline-progress',done:++done,total:tasks.length});}}));
      // Activate manifests only after every versioned dataset is downloaded.
      const cache=await caches.open(DATA);for(const request of await stage.keys())await cache.put(request,await stage.match(request));
      for(const office of ['estadual','federal'])await cache.put(`/api/election/${office}/manifest`,new Response(JSON.stringify(manifests[office]),{headers:{'Content-Type':'application/json'}}));
      await caches.delete(stageName);notify({type:'offline-done',at:new Date().toISOString()});event.ports[0]?.postMessage({ok:true});
    }catch(e){await caches.delete(stageName);notify({type:'offline-error',message:'Preparação incompleta. A cópia anterior foi preservada. '+e.message});event.ports[0]?.postMessage({ok:false,error:e.message});}
  })());
});
