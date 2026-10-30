import {getChatGPTUser} from '@/app/chatgpt-auth';
import {hasAdminAccess} from '@/lib/admin-access';
import {PUBLIC_SUPPLIER_PRODUCTS,publicProductPrice} from '@/lib/suppliers';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Entre para consultar referências públicas de materiais.'},{status:401});
 if(!await hasAdminAccess(request,user.userId))return Response.json({error:'Desbloqueie a área interna para consultar custos.'},{status:403});
 const checkedAt=new Date().toISOString(),date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const products=await Promise.all(PUBLIC_SUPPLIER_PRODUCTS.map(async item=>{
  try{
   const response=await fetch(item.url,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'text/html'}});
   if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw new Error();
   if(Number(response.headers.get('content-length')||0)>2_000_000)throw new Error();
   const html=await response.text();if(html.length>2_000_000)throw new Error();
   const found=publicProductPrice(html);if(!found)throw new Error();
   return {id:item.id,sourceUrl:item.url,status:'ok',quote:{supplier:'Sollares · preço público',name:item.name,modules:item.modules,moduleW:item.moduleW,inverterKw:item.inverterKw,cost:found.price,freight:0,freightConfirmed:false,date,sourceUrl:item.url,priceType:'public',example:false,note:`${found.condition} ${found.availability?`Estoque anunciado: ${found.availability.split('/').pop()}.`:''} Confirme o conteúdo do kit; estrutura e materiais elétricos do projeto permanecem separados para revisão.`}};
  }catch{return {id:item.id,sourceUrl:item.url,status:'unavailable',error:'Preço público não confirmado. Consulte a fonte ou importe a cotação do distribuidor.'};}
 }));
 return Response.json({checkedAt,products,note:'Consulta de páginas públicas, sem acesso a condições privadas de integrador. A consulta não altera propostas nem cotações salvas.'},{headers:{'Cache-Control':'private,max-age=900','X-Content-Type-Options':'nosniff'}});
}
