import {normalize,digits,validTitle,assess} from './crm-model.mjs';

export const duplicateFields={name:'Nome',title:'Título',cpf:'CPF',rg:'RG',mother:'Nome da mãe',birth:'Nascimento',zone:'Zona',section:'Seção',contact:'Telefone',leadership:'Liderança',coordinator:'Coordenador'};
const value=(r,k)=>['title','cpf','rg','contact'].includes(k)?digits(r[k]):['zone','section'].includes(k)&&/^\d+$/.test(r[k])?String(Number(r[k])):normalize(r[k]);
export function validCPF(input){const n=digits(input),dv=(s,w)=>([...s].reduce((a,c,i)=>a+Number(c)*(w-i),0)*10)%11%10;return n.length===11&&new Set(n).size>1&&n.slice(-2)===String(dv(n.slice(0,9),10))+String(dv(n.slice(0,10),11));}
export const duplicateGroupId=records=>'dup:'+records.map(r=>r.id).sort().join('|');
const timestamp=r=>{const t=Date.parse(r.createdAt);return Number.isFinite(t)?t:null;};

// A connected group prevents a conflicting CPF/title bridge from being resolved
// as two independent pairs. Names alone are leads for review, never identity proof.
export function duplicateGroups(records,reviews=[],locations={}){
  const map=new Map(records.map(r=>[r.id,r])),parent=new Map(records.map(r=>[r.id,r.id]));
  const find=id=>{let p=parent.get(id);if(p!==id){p=find(p);parent.set(id,p);}return p;};
  const join=(a,b)=>parent.set(find(a),find(b)),keys=new Map();
  for(const r of records){
    const title=digits(r.title),cpf=digits(r.cpf),name=normalize(r.name);
    const terms=[...(title.length>=8&&new Set(title).size>1?['T:'+title]:[]),...(cpf.length===11&&new Set(cpf).size>1?['C:'+cpf]:[]),...(name.length>3?['N:'+name]:[])];
    for(const term of terms){if(keys.has(term))join(r.id,keys.get(term));else keys.set(term,r.id);}
  }
  for(const review of reviews){const ids=(review.recordIds||[]).filter(id=>map.has(id));for(const id of ids.slice(1))join(ids[0],id);}
  const groups=new Map();for(const r of records){const key=find(r.id);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
  return [...groups.values()].filter(rows=>rows.length>1).map(rows=>{
    rows.sort((a,b)=>(timestamp(a)??Infinity)-(timestamp(b)??Infinity)||a.id.localeCompare(b.id));
    const id=duplicateGroupId(rows),review=reviews.find(r=>r.id===id),active=rows.filter(r=>!r.deleted);
    const differences=Object.entries(duplicateFields).filter(([k])=>new Set(rows.map(r=>value(r,k))).size>1).map(([field,label])=>({field,label}));
    const dates=rows.map(timestamp),oldest=dates.every(t=>t!==null)&&dates[0]<dates[1]?rows[0]:null;
    const matchingTitle=rows.every(r=>validTitle(r.title)&&digits(r.title)===digits(rows[0].title));
    const matchingCPF=rows.every(r=>validCPF(r.cpf)&&digits(r.cpf)===digits(rows[0].cpf));
    const blockers=[];
    if(!matchingTitle&&!matchingCPF)blockers.push('Identidade não confirmada por um mesmo título válido ou CPF válido. Nomes iguais podem ser homônimos.');
    if(differences.length)blockers.push('Dados divergentes: '+differences.map(d=>d.label).join(', ')+'. Confira os documentos antes de tratar.');
    if(!oldest)blockers.push('A ordem de criação não pôde ser comprovada: data ausente ou empate entre os registros mais antigos.');
    if(oldest?.deleted)blockers.push('O cadastro mais antigo está arquivado. Confira o motivo antes de reativá-lo.');
    const invalid=active.filter(r=>{const a=assess(r,locations);return !a.ready||a.secondaryFlags.some(f=>!/não informado|não atribuída/.test(f.message));});
    if(invalid.length)blockers.push('Há dados inválidos ou conferência documental pendente em '+invalid.length+' cadastro(s).');
    const unchanged=review?.recordIds?.length===rows.length&&rows.every(r=>review.recordVersions?.[r.id]===r.version);
    const resolved=review?.status==='resolved'&&unchanged&&active.length===1&&active[0].id===review.principalId;
    const eligible=!resolved&&active.length>0&&!blockers.length;
    const status=resolved?'resolved':eligible?'eligible':'review';
    const observation=review?.observation||(eligible?'Dados coincidentes e ordem de criação comprovada. Manter o cadastro mais antigo ativo, registrar a observação e arquivar as repetições com histórico.':'Conferência necessária. Os cadastros foram preservados; revise as divergências e a identidade.');
    return {id,records:rows,active:active.length,principalId:resolved?review.principalId:oldest?.id||null,status,eligible,differences,blockers:resolved?[]:blockers,observation,review:review||null};
  }).filter(g=>g.active>0||g.review).sort((a,b)=>({review:0,eligible:1,resolved:2}[a.status]-{review:0,eligible:1,resolved:2}[b.status])||a.records[0].name.localeCompare(b.records[0].name,'pt-BR'));
}

export function duplicateSummary(groups){return {groups:groups.length,review:groups.filter(g=>g.status==='review').length,eligible:groups.filter(g=>g.eligible).length,resolved:groups.filter(g=>g.status==='resolved').length};}
