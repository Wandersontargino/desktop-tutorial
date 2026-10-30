export type PinBootstrap={salt:string;hash:string;id:string;ownerEmail:string};
export function parsePinBootstrap(raw:unknown,authenticatedEmail:string):PinBootstrap|null{
 if(typeof raw!=='string')return null;
 try{
  const data=JSON.parse(raw) as PinBootstrap;
  if(!/^[a-f0-9]{64}$/.test(data.salt)||!/^[a-f0-9]{64}$/.test(data.hash)||!/^[a-f0-9]{32}$/.test(data.id))return null;
  if(typeof data.ownerEmail!=='string'||data.ownerEmail.trim().toLowerCase()!==authenticatedEmail.trim().toLowerCase())return null;
  return data;
 }catch{return null;}
}
