import {and,eq,desc} from 'drizzle-orm';
import {getDb} from '@/db';
import {records} from '@/db/schema';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {inputSchema,settingsSchema,tariffSchema,quoteSchema,clientSchema,recordSchema} from '@/lib/validation';
import {calculate} from '@/lib/solar';
import {hasAdminAccess} from '@/lib/admin-access';
import {publicRecord,ADMIN_KIND} from '@/lib/admin-privacy';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Entre com sua conta para acessar os dados.'},{status:401,headers});
 try{const admin=await hasAdminAccess(request,user.userId),rows=await getDb().select().from(records).where(eq(records.ownerId,user.userId)).orderBy(desc(records.updatedAt)).limit(5000);const safe=rows.filter(r=>r.kind!==ADMIN_KIND).map(r=>({id:r.id,kind:r.kind,revision:r.revision,data:JSON.parse(r.payload),createdAt:r.createdAt,updatedAt:r.updatedAt}));return Response.json({adminUnlocked:admin,records:admin?safe:safe.map(publicRecord).filter(Boolean)},{headers});}
 catch{return Response.json({error:'Não foi possível carregar a base. Tente novamente.'},{status:503,headers});}
}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Entre com sua conta para salvar.'},{status:401,headers});
 if(!await hasAdminAccess(request,user.userId))return Response.json({error:'Desbloqueie a área de administrador com o PIN para salvar alterações.'},{status:403,headers});
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Origem não permitida.'},{status:403,headers});
 if(Number(request.headers.get('content-length')||0)>1000000)return Response.json({error:'Arquivo muito grande.'},{status:413,headers});
 try{
  const raw=await request.text();if(raw.length>1000000)return Response.json({error:'Dados muito grandes.'},{status:413,headers});
  const parsed=recordSchema.safeParse(JSON.parse(raw));if(!parsed.success)return Response.json({error:'Formato inválido.'},{status:400,headers});
  const {id,kind,revision,data}=parsed.data,schema={proposal:inputSchema,settings:settingsSchema,tariff:tariffSchema,quote:quoteSchema,client:clientSchema}[kind],checked=schema.safeParse(data);
  if(!checked.success)return Response.json({error:checked.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join(' • ')},{status:400,headers});
  const db=getDb(),[existing]=await db.select().from(records).where(eq(records.id,id)).limit(1);
  if(existing&&(existing.ownerId!==user.userId||existing.kind!==kind))return Response.json({error:'Registro indisponível.'},{status:404,headers});
  if((existing?.revision||0)!==revision)return Response.json({error:'Este registro foi atualizado em outro aparelho. Recarregue antes de salvar.'},{status:409,headers});
  if(kind==='proposal'){const p=checked.data as Parameters<typeof calculate>[0];calculate(p);if(p.clientId){const [client]=await db.select({id:records.id}).from(records).where(and(eq(records.id,p.clientId),eq(records.ownerId,user.userId),eq(records.kind,'client'))).limit(1);if(!client)return Response.json({error:'Perfil do cliente não encontrado nesta conta.'},{status:400,headers});}}
  const now=new Date().toISOString();
  if(existing){const updated=await db.update(records).set({payload:JSON.stringify(checked.data),revision:revision+1,updatedAt:now}).where(and(eq(records.id,id),eq(records.ownerId,user.userId),eq(records.revision,revision))).returning({id:records.id});if(!updated.length)return Response.json({error:'Alteração simultânea. Recarregue a base.'},{status:409,headers});}
  else{const count=await db.select({id:records.id}).from(records).where(eq(records.ownerId,user.userId)).limit(5001);if(count.length>=5000)return Response.json({error:'Limite de 5.000 registros atingido. Exporte um backup.'},{status:400,headers});await db.insert(records).values({id,ownerId:user.userId,kind,payload:JSON.stringify(checked.data),revision:1,createdAt:now,updatedAt:now});}
  return Response.json({record:{id,kind,revision:revision+1,data:checked.data,createdAt:existing?.createdAt||now,updatedAt:now}},{headers});
 }catch{return Response.json({error:'Não foi possível salvar. Seus dados no formulário foram preservados.'},{status:500,headers});}
}
