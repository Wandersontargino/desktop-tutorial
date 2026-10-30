'use client';
import {useState} from 'react';
import {LockKeyhole,X} from 'lucide-react';
export default function AdminPinDialog({configured,signedIn,onClose,onUnlocked}:{configured:boolean;signedIn:boolean;onClose:()=>void;onUnlocked:()=>Promise<void>}){
 const [pin,setPin]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent){
  e.preventDefault();if(!signedIn)return;setBusy(true);setError('');
  try{const response=await fetch('/api/admin-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:configured?'unlock':'setup',pin,confirmation})}),data=await response.json() as {error?:string};setPin('');setConfirmation('');if(!response.ok)throw new Error(data.error||'Não foi possível desbloquear.');await onUnlocked();onClose();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="modal-overlay admin-pin-overlay"><form className="modal admin-pin-dialog" role="dialog" aria-modal="true" aria-label={configured?'Desbloquear administrador':'Definir PIN do administrador'} onSubmit={e=>void submit(e)}><div className="modal-heading"><span className="round-icon"><LockKeyhole size={24}/></span><button type="button" className="icon-btn" aria-label="Fechar acesso interno" onClick={onClose}><X/></button></div><h2>{configured?'Área de administrador':'Defina seu PIN de acesso'}</h2><p>{configured?'Digite seu PIN de quatro dígitos para ver custos, margem, comissões e cotações.':'Escolha um PIN de quatro dígitos. Ele protege a área de custos e lucro durante a apresentação, além do acesso privado da sua conta.'}</p>
  {signedIn?<><label className="field"><span>{configured?'PIN de quatro dígitos':'Novo PIN de quatro dígitos'}</span><input autoFocus type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} required/></label>{!configured&&<label className="field"><span>Confirme o PIN</span><input type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} value={confirmation} onChange={e=>setConfirmation(e.target.value.replace(/\D/g,''))} required/></label>}{error&&<p className="pending-note" role="alert">{error}</p>}<button className="btn primary full" disabled={busy||pin.length!==4||(!configured&&confirmation.length!==4)}>{busy?'Verificando…':configured?'Desbloquear área interna':'Definir PIN e entrar'}</button></>:<a className="btn primary full" href="/signin-with-chatgpt?return_to=/" target="_top">Entrar na sua conta para definir o PIN</a>}
  <small>A área se bloqueia ao apresentar ao cliente e após dez minutos. Cinco tentativas incorretas bloqueiam novas tentativas por 15 minutos. O PIN complementa o acesso privado da sua conta.</small>
 </form></div>;
}
