import {getChatGPTUser} from '@/app/chatgpt-auth';
import {getDb} from '@/db';
import {records} from '@/db/schema';
import {ADMIN_KIND} from '@/lib/admin-privacy';
import {readGate,writeGate,hasAdminAccess,sessionCookie,cookieToken,initializeOwnerPin,ADMIN_SESSION_MS,type AdminGate} from '@/lib/admin-access';
import {validPin,pinHash,equalHashes,randomToken,tokenHash} from '@/lib/admin-pin';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({configured:false,unlocked:false},{status:401,headers});
 try{const row=await initializeOwnerPin(user.userId,user.email),unlocked=await hasAdminAccess(request,user.userId);return Response.json({configured:!!row,unlocked,lockedUntil:row?.gate.lockedUntil||0},{headers});}
 catch{return Response.json({error:'Não foi possível verificar a proteção. A área interna permanece bloqueada.'},{status:503,headers});}
}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Entre na sua conta para acessar a área interna.'},{status:401,headers});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origem não permitida.'},{status:403,headers});
 try{
  const raw=await request.text();if(raw.length>1000)return Response.json({error:'Requisição inválida.'},{status:400,headers});
  const {action,pin,confirmation}=JSON.parse(raw),row=await initializeOwnerPin(user.userId,user.email),now=Date.now();
  if(action==='lock'){
   if(row){const hash=await tokenHash(cookieToken(request));if(!await writeGate(row,{...row.gate,sessions:row.gate.sessions.filter(s=>!equalHashes(s.hash,hash)&&s.expires>now)}))return Response.json({error:'Tente bloquear novamente.'},{status:409,headers});}
   return Response.json({configured:!!row,unlocked:false},{headers:{...headers,'Set-Cookie':sessionCookie('',0,request)}});
  }
  if(!validPin(pin))return Response.json({error:'O PIN deve ter exatamente quatro dígitos.'},{status:400,headers});
  if(action==='setup'){
   if(row)return Response.json({error:'O PIN já foi configurado. Use a opção de desbloqueio.'},{status:409,headers});
   if(pin!==confirmation)return Response.json({error:'Os PINs não coincidem.'},{status:400,headers});
   const salt=randomToken(),token=randomToken(),gate:AdminGate={salt,hash:await pinHash(pin,salt),failures:0,lockedUntil:0,sessions:[{hash:await tokenHash(token),expires:now+ADMIN_SESSION_MS}]},timestamp=new Date().toISOString();
   const result=await getDb().insert(records).values({id:`admin_${user.userId}`,ownerId:user.userId,kind:ADMIN_KIND,payload:JSON.stringify(gate),revision:1,createdAt:timestamp,updatedAt:timestamp}).onConflictDoNothing().returning({id:records.id});
   if(!result.length)return Response.json({error:'O PIN foi configurado em outra sessão. Reabra a área interna.'},{status:409,headers});
   return Response.json({configured:true,unlocked:true,expiresAt:now+ADMIN_SESSION_MS},{headers:{...headers,'Set-Cookie':sessionCookie(token,ADMIN_SESSION_MS/1000,request)}});
  }
  if(action!=='unlock'||!row)return Response.json({error:'Defina o PIN antes de desbloquear.'},{status:400,headers});
  if(row.gate.lockedUntil>now)return Response.json({error:'Após cinco tentativas incorretas, aguarde 15 minutos para tentar novamente.'},{status:429,headers});
  if(!equalHashes(await pinHash(pin,row.gate.salt),row.gate.hash)){
   const failures=row.gate.failures+1;await writeGate(row,{...row.gate,failures,lockedUntil:failures>=5?now+15*60*1000:0});
   return Response.json({error:failures>=5?'PIN incorreto. Aguarde 15 minutos antes de tentar novamente.':'PIN incorreto.'},{status:failures>=5?429:403,headers});
  }
  const token=randomToken(),sessions=[...row.gate.sessions.filter(s=>s.expires>now).slice(-4),{hash:await tokenHash(token),expires:now+ADMIN_SESSION_MS}];
  if(!await writeGate(row,{...row.gate,failures:0,lockedUntil:0,sessions}))return Response.json({error:'A proteção foi atualizada. Tente novamente.'},{status:409,headers});
  return Response.json({configured:true,unlocked:true,expiresAt:now+ADMIN_SESSION_MS},{headers:{...headers,'Set-Cookie':sessionCookie(token,ADMIN_SESSION_MS/1000,request)}});
 }catch{return Response.json({error:'Não foi possível acessar a área interna. Os dados permanecem protegidos.'},{status:503,headers});}
}
