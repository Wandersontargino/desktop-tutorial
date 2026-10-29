import { database } from './database.mjs';
import { cleanRecord, validTitle, digits, normalize } from '../lib/crm-model.mjs';
const text=(value,status=200)=>new Response(value,{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const digest=async s=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
const equal=(a,b)=>{if(a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0;};
async function send(env,to,message){
  if(!/^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_VERSION||''))throw new Error('Configure a versão da API empresarial.');
  const response=await fetch(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${env.WHATSAPP_PHONE_ID}/messages`,{method:'POST',headers:{Authorization:'Bearer '+env.WHATSAPP_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{body:message}})});
  if(!response.ok)throw new Error('A resposta empresarial não foi aceita pelo serviço.');
}
async function conversation(db,env,message){
  if(!message.id||!/^\d{8,18}$/.test(message.from||''))return;
  const known=await db.first('SELECT * FROM crm_whatsapp_receipts WHERE id=?',[message.id]);
  if(known){if(!known.sent){await send(env,message.from,known.response);await db.run('UPDATE crm_whatsapp_receipts SET sent=1 WHERE id=?',[message.id]);}return;}
  const content=String(message.text?.body||'').trim().slice(0,2000),start=content.match(/CADASTRO\s+([a-f0-9]{64})/i),sender=await digest(message.from);
  let session=await db.first('SELECT * FROM crm_whatsapp_sessions WHERE sender=?',[sender]),response,commands=[];
  const stamp=new Date().toISOString();
  if(start){
    const link=await db.first('SELECT * FROM crm_links WHERE token=? AND disabled=0',[await digest(start[1].toLowerCase())]);
    if(!link)response='Este link de cadastro foi desativado ou não existe. Peça um novo link à liderança.';
    else{session={link_id:link.id,step:'consent',payload:JSON.stringify({leadership:link.leadership,coordinator:link.coordinator,contact:message.from})};response=`Cadastro para ${link.leadership}. Você autoriza registrar nome, título, zona, seção e telefone nesta base? Responda SIM ou NÃO. Não informe em quem votou.`;}
  }else if(!session)response='Para iniciar, use o link de cadastro fornecido pela liderança. Este canal recebe somente cadastros autorizados.';
  else{
    const link=await db.first('SELECT * FROM crm_links WHERE id=? AND disabled=0',[session.link_id]);
    if(!link||Date.now()-new Date(session.updated_at||stamp).getTime()>48*3600000){response='O cadastro expirou ou o link foi desativado. Inicie novamente pelo link da liderança.';session=null;}
    else{
      const r=JSON.parse(session.payload),answer=normalize(content);
      if(answer==='CANCELAR'||session.step==='consent'&&answer==='NAO'){response='Cadastro cancelado. Nenhuma inscrição foi enviada para a base.';session=null;}
      else if(session.step==='consent'){
        if(answer!=='SIM')response='Responda SIM para autorizar o registro ou NÃO para cancelar.';
        else{session.step='name';response='Qual é seu nome completo?';}
      }else if(session.step==='name'){
        if(content.length<5)response='Informe seu nome completo.';else{r.name=content;session.step='title';response='Informe o número do título de eleitor, incluindo os zeros iniciais.';}
      }else if(session.step==='title'){
        r.title=digits(content);session.step='zone';response=(validTitle(r.title)?'Dígitos do título conferem. ':'O título precisará de conferência pela liderança. ')+'Qual é sua zona eleitoral?';
      }else if(session.step==='zone'){
        if(!/^\d{1,3}$/.test(content)||+content<1)response='Informe a zona somente com números.';else{r.zone=content;session.step='section';response='Qual é sua seção eleitoral?';}
      }else if(session.step==='section'){
        if(!/^\d{1,5}$/.test(content)||+content<1)response='Informe a seção somente com números.';else{r.section=content;session.step='confirm';response=`Confira: ${r.name}, título ${r.title}, zona ${r.zone}, seção ${r.section}. Responda SIM para enviar à revisão ou CANCELAR para descartar.`;}
      }else if(session.step==='confirm'){
        if(answer!=='SIM')response='Responda SIM para enviar os dados conferidos ou CANCELAR para descartar.';
        else{const record=cleanRecord({...r,id:crypto.randomUUID(),source:'WhatsApp empresarial • envio autorizado'}),submission=await digest(message.id);commands.push(['INSERT OR IGNORE INTO crm_intake(id,link_id,payload,status,source,created_at) VALUES(?,?,?,?,?,?)',[submission,session.link_id,JSON.stringify(record),'pending','WhatsApp',stamp]]);response='Cadastro recebido para revisão. A liderança conferirá as informações. O cadastro não identifica seu voto.';session=null;}
      }
      if(session)session.payload=JSON.stringify(r);
    }
  }
  if(session)commands.push(['INSERT INTO crm_whatsapp_sessions(sender,link_id,step,payload,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(sender) DO UPDATE SET link_id=excluded.link_id,step=excluded.step,payload=excluded.payload,updated_at=excluded.updated_at',[sender,session.link_id,session.step,session.payload,stamp]]);
  else commands.push(['DELETE FROM crm_whatsapp_sessions WHERE sender=?',[sender]]);
  commands.push(['INSERT INTO crm_whatsapp_receipts(id,response,sent,created_at) VALUES(?,?,0,?)',[message.id,response,stamp]]);
  await db.batch(commands);await send(env,message.from,response);await db.run('UPDATE crm_whatsapp_receipts SET sent=1 WHERE id=?',[message.id]);
}
export async function whatsapp(req,env){
  if(!env.WHATSAPP_APP_SECRET||!env.WHATSAPP_ACCESS_TOKEN||!env.WHATSAPP_PHONE_ID||!env.WHATSAPP_VERIFY_TOKEN||!env.WHATSAPP_GRAPH_VERSION)return text('Integração empresarial ainda não configurada.',503);
  const url=new URL(req.url);
  if(req.method==='GET')return equal(url.searchParams.get('hub.verify_token')||'',env.WHATSAPP_VERIFY_TOKEN)&&url.searchParams.get('hub.mode')==='subscribe'?text(url.searchParams.get('hub.challenge')||''):text('Verificação inválida.',403);
  if(req.method!=='POST')return text('Método inválido.',405);
  if(+req.headers.get('content-length')>250000)return text('Envio muito grande.',413);
  const raw=await req.text();if(new TextEncoder().encode(raw).length>250000)return text('Envio muito grande.',413);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.WHATSAPP_APP_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature='sha256='+hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw)));
  if(!equal(signature,req.headers.get('x-hub-signature-256')||''))return text('Assinatura inválida.',403);
  try{const data=JSON.parse(raw),db=database(env);for(const entry of data.entry||[])for(const change of entry.changes||[])for(const message of change.value?.messages||[])await conversation(db,env,message);return text('Recebido');}catch(e){console.error('Recepção empresarial:',e.message);return text('Recepção não concluída. Tente novamente.',503);}
}
