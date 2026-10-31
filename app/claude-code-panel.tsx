'use client';
import {useEffect,useRef,useState} from 'react';
import {Download,Terminal,ShieldCheck} from 'lucide-react';

export default function ClaudeCodePanel({onAdminRequired}:{onAdminRequired:()=>void}) {
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const pending=useRef<AbortController|null>(null);
  useEffect(()=>()=>pending.current?.abort(),[]);

  async function download() {
    if(pending.current)return;
    const controller=new AbortController();
    pending.current=controller;setBusy(true);setMessage('');
    try {
      const response=await fetch('/api/development/workspace',{signal:controller.signal});
      if(!response.ok){
        const result:unknown=await response.json().catch(()=>null);
        const reason=result&&typeof result==='object'&&'error' in result&&typeof result.error==='string'?result.error:'Não foi possível baixar o projeto.';
        if(response.status===403)onAdminRequired();
        throw new Error(reason);
      }
      const blob=await response.blob();
      if(controller.signal.aborted)return;
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='CoopSun_Projeto_Claude_Code.zip';
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      setMessage('Download iniciado. Extraia o ZIP e abra ABRIR_COOPSUN_COM_IA.cmd na pasta CoopSun.');
    } catch(error) {
      if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'Falha no download.');
    } finally {
      if(pending.current===controller){pending.current=null;if(!controller.signal.aborted)setBusy(false);}
    }
  }

  return <section className="card section-card claude-code-panel">
    <div className="section-heading"><div><h3><Terminal size={19} aria-hidden="true"/> Projeto para Claude Code</h3>
      <p>Abra os códigos da CoopSun no assistente que você configurou no Windows.</p></div></div>
    <ol className="claude-code-steps">
      <li><b>Baixe e extraia o projeto.</b><span>O pacote reúne os códigos, testes e orientações da CoopSun.</span></li>
      <li><b>Abra ABRIR_COOPSUN_COM_IA.cmd.</b><span>O iniciador usa a conexão e a chave já salvas no computador.</span></li>
      <li><b>Peça a revisão ou melhoria desejada.</b><span>O assistente recebe as regras do projeto e os comandos de validação.</span></li>
    </ol>
    <div className="button-row"><button className="btn primary" disabled={busy} onClick={()=>void download()}>
      <Download size={17}/>{busy?'Preparando download…':'Baixar projeto para Claude Code'}</button></div>
    <p className="hint claude-code-privacy"><ShieldCheck size={15} aria-hidden="true"/> A cópia de desenvolvimento mantém faturas, cadastros e credenciais fora do pacote.</p>
    <p className="hint">Mudanças feitas no computador chegam ao Site após revisão e publicação pelo proprietário.</p>
    {message&&<p className="notice" role="status" aria-live="polite">{message}</p>}
  </section>;
}
