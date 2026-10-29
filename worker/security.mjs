import {randomTotp,encryptTotp,decryptTotp,checkTotp,codeHash} from '../lib/totp.mjs';
const failure=(message,status=400)=>Object.assign(Error(message),{status});
export async function mfaState(db,user){return await db.first('SELECT * FROM crm_mfa WHERE user_id=?',[user.id]);}
export async function verifyMfa(db,user,code,master){
  const row=await mfaState(db,user);if(!row?.enabled)return true;
  if(!/^\d{6}$/.test(String(code||''))){const hash=await codeHash(String(code||'').trim().toUpperCase()),recovery=JSON.parse(row.recovery||'[]'),remaining=recovery.filter(value=>value!==hash);if(remaining.length===recovery.length)return false;const result=await db.run('UPDATE crm_mfa SET recovery=? WHERE user_id=? AND enabled=1 AND recovery=?',[JSON.stringify(remaining),user.id,row.recovery]);return !!result.meta?.changes;}
  const secret=await decryptTotp(row.secret,user.id,master),step=await checkTotp(secret,code,{after:row.last_step});
  if(step!==null){const result=await db.run('UPDATE crm_mfa SET last_step=? WHERE user_id=? AND enabled=1 AND last_step=?',[step,user.id,row.last_step]);return !!result.meta?.changes;}
  return false;
}
export async function security(db,user,data,master){
  const row=await mfaState(db,user);
  if(data.action==='setup'){
    if(row?.enabled)throw failure('Desative a verificação atual antes de cadastrar outro autenticador.');
    const secret=randomTotp(),encrypted=await encryptTotp(secret,user.id,master);
    await db.run('INSERT INTO crm_mfa(user_id,pending,pending_until,enabled,last_step,recovery) VALUES(?,?,?,0,-1,?) ON CONFLICT(user_id) DO UPDATE SET pending=excluded.pending,pending_until=excluded.pending_until WHERE crm_mfa.enabled=0',[user.id,encrypted,Date.now()+300000,'[]']);
    return {secret,uri:'otpauth://totp/'+encodeURIComponent('Eleitoral PA:'+user.email)+'?secret='+secret+'&issuer=Eleitoral%20PA&algorithm=SHA1&digits=6&period=30'};
  }
  if(data.action==='enable'){
    if(!row?.pending||row.pending_until<Date.now()||row.enabled)throw failure('Configuração expirada. Gere uma nova chave.');
    const step=await checkTotp(await decryptTotp(row.pending,user.id,master),String(data.code||''));if(step===null)throw failure('Código inválido. Confira o relógio do aparelho e tente novamente.');
    const codes=Array.from({length:10},()=>[...crypto.getRandomValues(new Uint8Array(8))].map(value=>value.toString(16).padStart(2,'0')).join('').toUpperCase()),hashes=await Promise.all(codes.map(codeHash));
    const recovery=JSON.stringify(hashes),guard='EXISTS(SELECT 1 FROM crm_mfa WHERE user_id=? AND enabled=1 AND recovery=?)',result=await db.batch([
      ['UPDATE crm_mfa SET secret=pending,pending=NULL,pending_until=0,enabled=1,last_step=?,recovery=? WHERE user_id=? AND enabled=0 AND pending=?',[step,recovery,user.id,row.pending]],
      [`UPDATE crm_users SET version=version+1 WHERE id=? AND ${guard}`,[user.id,user.id,recovery]],
      [`DELETE FROM crm_sessions WHERE user_id=? AND ${guard}`,[user.id,user.id,recovery]]
    ]);if(!result[0].meta?.changes)throw failure('A configuração mudou em outro acesso.',409);return {enabled:true,recoveryCodes:codes};
  }
  if(data.action==='disable'){
    if(!row?.enabled||!await verifyMfa(db,user,data.code,master))throw failure('Informe um código válido ou um código de recuperação.',401);
    await db.batch([['UPDATE crm_users SET version=version+1 WHERE id=?',[user.id]],['DELETE FROM crm_sessions WHERE user_id=?',[user.id]],['DELETE FROM crm_mfa WHERE user_id=?',[user.id]]]);return {enabled:false};
  }
  throw failure('Operação de segurança inválida.');
}
