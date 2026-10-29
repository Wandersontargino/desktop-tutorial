const encode=new TextEncoder(),decode=new TextDecoder();
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const b64=b=>{let s='';for(const x of new Uint8Array(b))s+=String.fromCharCode(x);return btoa(s);};
export async function deriveVaultKey(password,salt){
  const material=await crypto.subtle.importKey('raw',encode.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations:600000},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function seal(value,key){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encode.encode(JSON.stringify(value)));return {iv:b64(iv),cipher:b64(cipher)};}
export async function unseal(value,key){return JSON.parse(decode.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(value.iv)},key,bytes(value.cipher))));}
export const newSalt=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
async function database(){return new Promise((resolve,reject)=>{
  let settled=false,request;const fail=()=>{if(settled)return;settled=true;clearTimeout(timer);reject(new Error('O armazenamento protegido não abriu. Feche outras abas da plataforma e tente novamente.'));};
  const timer=setTimeout(fail,4000);
  try{request=indexedDB.open('pa-2026-protected',1);}catch{fail();return;}
  request.onupgradeneeded=()=>request.result.createObjectStore('vaults');
  request.onsuccess=()=>{if(settled){request.result.close();return;}settled=true;clearTimeout(timer);resolve(request.result);};request.onerror=fail;request.onblocked=fail;
});}
export async function vaultStore(action,email,value){const db=await database();return new Promise((resolve,reject)=>{
  let result,tx,settled=false;const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);db.close();error?reject(error):resolve(result);};
  const fail=()=>finish(new Error('Não foi possível acessar a cópia offline. As cópias anteriores foram preservadas.'));
  const timer=setTimeout(()=>{try{tx?.abort();}catch{}fail();},5000);
  try{tx=db.transaction('vaults',action==='get'?'readonly':'readwrite');const store=tx.objectStore('vaults'),request=action==='get'?store.get(email):action==='delete'?store.delete(email):store.put(value,email);request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>finish();tx.onerror=fail;tx.onabort=fail;}catch{fail();}
});}
