// The emergency copy is already AES-GCM encrypted by the vault. No password,
// key, record or note is written here in plaintext.
const prefix='pa-protected-emergency:';
const memory=new Map();
const getStorage=value=>{try{return value===undefined?globalThis.localStorage:value;}catch{return null;}};
export function keepEmergencyCopy(email,copy,storage){
  const value={...copy,preservedAt:new Date().toISOString()};memory.set(email,value);
  try{getStorage(storage)?.setItem(prefix+email,JSON.stringify(value));}catch{}
}
export function emergencyCopies(email,storage){
  const copies=[];const current=memory.get(email);if(current)copies.push(current);
  try{const saved=JSON.parse(getStorage(storage)?.getItem(prefix+email)||'null');if(saved&&typeof saved.cipher==='string'&&typeof saved.iv==='string'&&typeof saved.salt==='string'&&!copies.some(c=>c.cipher===saved.cipher))copies.push(saved);}catch{}
  return copies;
}
export function clearEmergencyCopy(email,cipher,storage){
  if(memory.get(email)?.cipher===cipher)memory.delete(email);
  try{const store=getStorage(storage),current=JSON.parse(store?.getItem(prefix+email)||'null');if(current?.cipher===cipher)store.removeItem(prefix+email);}catch{}
}
