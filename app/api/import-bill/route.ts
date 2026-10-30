import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {hasAdminAccess} from '@/lib/admin-access';
import {billImportSchema} from '@/lib/validation';
import {createClientAndProject,ImportFailure,type ImportDB} from '@/lib/bill-import-server';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Entre com sua conta para criar o perfil e o projeto.'},{status:401,headers});
 if(!await hasAdminAccess(request,user.userId))return Response.json({error:'Desbloqueie a área de administrador para criar o perfil e o projeto.'},{status:403,headers});
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Origem não permitida.'},{status:403,headers});
 try{const raw=await request.text();if(raw.length>1000000)return Response.json({error:'A leitura ultrapassou o tamanho permitido.'},{status:413,headers});const parsed=billImportSchema.safeParse(JSON.parse(raw));if(!parsed.success)return Response.json({error:parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join(' • ')},{status:400,headers});if(!env.DB)throw new Error('DB indisponível');return Response.json(await createClientAndProject(env.DB as unknown as ImportDB,user.userId,parsed.data.requestId,parsed.data.proposal),{headers});}
 catch(e){return Response.json({error:e instanceof ImportFailure?e.message:'Não foi possível salvar. A conta lida foi preservada para você tentar novamente.'},{status:e instanceof ImportFailure?e.status:503,headers});}
}
