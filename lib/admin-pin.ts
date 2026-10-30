const encoder=new TextEncoder();
export const PIN_ITERATIONS=100000;
export const validPin=(pin:unknown):pin is string=>typeof pin==='string'&&/^\d{4}$/.test(pin);
export const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
export async function tokenHash(token:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token))),v=>v.toString(16).padStart(2,'0')).join('');}
export async function pinHash(pin:string,salt:string){
 const key=await crypto.subtle.importKey('raw',encoder.encode(pin),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:PIN_ITERATIONS,hash:'SHA-256'},key,256);
 return Array.from(new Uint8Array(bits),v=>v.toString(16).padStart(2,'0')).join('');
}
export function equalHashes(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
