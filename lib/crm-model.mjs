export const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
export const digits=s=>String(s??'').replace(/\D/g,'');
const documentaryMarker='CONFERÊNCIA DOCUMENTAL PENDENTE.';
export function documentaryReviewPending(record){return /^CONFERENCIA DOCUMENTAL PENDENTE\b/.test(normalize(record?.notes));}
export function setDocumentaryReview(notes,pending){const original=String(notes??'').replace(/^\s*CONFER[ÊE]NCIA DOCUMENTAL PENDENTE[.:]?\s*/i,'').trim();return pending?[documentaryMarker,original].filter(Boolean).join(' '):original;}
export function confirmedElectoralLocation(r){
  const l=r.location,place=normalize(l?.place);
  return !!(l?.cityCode&&l.city&&/^[1-9]\d{0,2}$/.test(String(Number(r.zone)))&&/^[1-9]\d{0,3}$/.test(String(Number(r.section)))&&place&&!['LOCAL NAO INFORMADO','LOCAL NAO CONFIRMADO'].includes(place)&&!r.locationConflict);
}
// Registration approval remains independent from result accounting.
export function countableForResults(r){
  return !r.deleted&&confirmedElectoralLocation(r);
}
export function registrationOK(r){
  return r.ready===true&&!(r.primaryFlags||[]).length&&confirmedElectoralLocation(r);
}
export function validTitle(value){
  const n=digits(value);if(![12,13].includes(n.length)||new Set(n).size===1)return false;
  const uf=n.slice(-4,-2),sequence=n.slice(0,-4);if(+uf<1||+uf>28||n.length===13&&!['01','02'].includes(uf))return false;
  const weights=sequence.length===8?[2,3,4,5,6,7,8,9]:[9,2,3,4,5,6,7,8,9];
  const dv=v=>v===10?0:v===0&&['01','02'].includes(uf)?1:v;
  const a=dv([...sequence].reduce((v,x,i)=>v+(+x)*weights[i],0)%11),b=dv((+uf[0]*7+ +uf[1]*8+a*9)%11);
  return n.slice(-2)===String(a)+String(b);
}
export function cleanRecord(input){
  const clean=(v,max=160)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
  let title=digits(input.title);if(input.literalTitle!==true&&title.length===11&&validTitle('0'+title))title='0'+title;
  const num=v=>/^\d+$/.test(clean(v))?String(Number(v)):clean(v,8);
  return {id:clean(input.id,80),name:clean(input.name,120).toUpperCase(),title:title.slice(0,24),zone:num(input.zone),section:num(input.section),contact:clean(input.contact,60),leadership:clean(input.leadership,80).toUpperCase()||'SEM LIDERANÇA',coordinator:clean(input.coordinator,100).toUpperCase(),mother:clean(input.mother,120).toUpperCase(),cpf:clean(input.cpf,20),rg:clean(input.rg,24),birth:clean(input.birth,12),notes:clean(input.notes,1600),version:Number(input.version)||0,source:clean(input.source,200),deleted:Boolean(input.deleted),...(input.literalTitle===true?{literalTitle:true}:{})};
}
export function titleIndex(records){
  const index=new Map();
  for(const r of records){
    if(r.deleted)continue;const title=digits(r.title);
    if(!index.has(title))index.set(title,new Set());index.get(title).add(r.id);
  }
  return index;
}
export function coordinatorIndex(records){
  const index=new Map();
  for(const r of records){
    if(r.deleted)continue;
    const leader=normalize(r.leadership),coordinator=normalize(r.coordinator);
    if(!leader||leader==='SEM LIDERANCA'||!coordinator)continue;
    if(!index.has(leader))index.set(leader,new Set());index.get(leader).add(coordinator);
  }
  return index;
}
export function assessRecords(records,locations={}){
  const index=titleIndex(records),coordinators=coordinatorIndex(records);return records.map(r=>assess(r,locations,index,coordinators));
}
export function assess(record,locations={},all=[],coordinators=null){
  const r=cleanRecord(record),flags=[],titleValid=validTitle(r.title);
  const problem=(message,priority='alta',main=true)=>flags.push({message,priority,category:main?'primary':'secondary'});
  if(documentaryReviewPending(r))problem('Conferência documental pendente. Corrija os dados e conclua a conferência no cadastro.');
  if(!r.name)problem('Nome não informado.');if(!titleValid)problem('Formato ou dígitos do título não conferem.');
  const zoneOK=/^[1-9]\d{0,2}$/.test(r.zone),sectionOK=/^[1-9]\d{0,3}$/.test(r.section);
  if(!zoneOK)problem('Zona ausente ou inválida.');if(!sectionOK)problem('Seção ausente ou inválida.');
  const candidates=zoneOK&&sectionOK?locations[`${r.zone}|${r.section}`]||[]:[];
  const candidateLocation=candidates.length===1?candidates[0]:null;
  const location=confirmedElectoralLocation({...r,location:candidateLocation})?candidateLocation:null;
  if(zoneOK&&sectionOK&&!location)problem(candidates.length>1?'Zona/seção tem mais de um local: conferir município.':'Zona/seção não localizada na fonte de 2026.');
  const ids=all instanceof Map?all.get(r.title):null;
  const duplicate=validTitle(r.title)&&(all instanceof Map?Boolean(ids&&ids.size>(ids.has(r.id)?1:0)):all.some(o=>!o.deleted&&o.id!==r.id&&digits(o.title)===r.title));
  if(duplicate)problem('Título também informado em outro cadastro. Conferir identidade antes de unir.');
  if(r.cpf){const n=digits(r.cpf),dv=(part,start)=>([...part].reduce((v,x,i)=>v+(+x)*(start-i),0)*10)%11%10;if(n.length!==11||new Set(n).size===1||n.slice(-2)!==String(dv(n.slice(0,9),10))+String(dv(n.slice(0,10),11)))problem('Dígitos do CPF não conferem.','alta',false);}
  if(!r.cpf&&!r.rg)problem('RG ou CPF não informado.','média',false);
  if(!r.mother)problem('Nome da mãe não informado.','média',false);
  if(!r.birth)problem('Nascimento não informado.','média',false);
  else {
    const date=/^\d{4}-\d{2}-\d{2}$/.test(r.birth)?new Date(r.birth+'T12:00:00Z'):null;
    if(!date||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==r.birth)problem('Data de nascimento inválida: conferir dia, mês e ano.','média',false);
    else if(r.birth>new Date().toISOString().slice(0,10))problem('Data de nascimento no futuro.','média',false);
  }
  if(/RASURADO|ILEGIVEL|POUCO NITIDA/.test(normalize(r.notes)))problem('Observação da origem exige conferência documental.','média',false);
  let p=digits(r.contact);if([12,13].includes(p.length)&&p.startsWith('55'))p=p.slice(2);
  if(!/^(?:[1-9]\d9\d{8}|[1-9]\d[2-5]\d{7})$/.test(p))problem(r.contact?'Telefone incompleto ou fora do padrão com DDD.':'Telefone não informado.','média',false);
  if(r.leadership==='SEM LIDERANÇA')problem('Liderança não atribuída.','média',false);
  if(!r.coordinator)problem('Coordenador não informado.','média',false);
  const coordination=coordinators||(Array.isArray(all)?coordinatorIndex(all):null);
  if(coordination?.get(normalize(r.leadership))?.size>1)problem('Liderança vinculada a mais de um coordenador: conferir a atribuição.','média',false);
  const primaryFlags=flags.filter(f=>f.category==='primary'),secondaryFlags=flags.filter(f=>f.category==='secondary');
  const ready=!primaryFlags.length,status=ready?'green':'red';
  return {...r,location,flags,primaryFlags,secondaryFlags,secondaryPending:secondaryFlags.length>0,status,titleValid,ready,duplicate};
}
export function quality(records){
  const active=records.filter(r=>!r.deleted),count=k=>active.filter(r=>r[k]).length;
  return {total:active.length,uncounted:active.filter(r=>!countableForResults(r)).length,ready:count('ready'),titles:count('titleValid'),pending:active.filter(r=>r.ready===false).length,complementary:active.filter(r=>r.ready&&r.secondaryPending).length,complete:active.filter(r=>r.ready&&!r.secondaryPending).length,duplicates:count('duplicate'),located:count('location'),rate:active.length?100*count('ready')/active.length:null};
}
export function parseIntakeText(text){
  const result={},aliases={name:'(?:nome)',title:'(?:t[ií]tulo(?: de eleitor)?)',zone:'(?:zona)',section:'(?:se[cç][aã]o)',contact:'(?:fone|telefone|contato|tel)',mother:'(?:m[aã]e|nome da m[aã]e)',cpf:'CPF',rg:'RG',birth:'(?:nascimento|nasc|data de nascimento)',notes:'(?:observa[cç][aã]o|observa[cç][oõ]es|obs)'};
  const labels=Object.values(aliases).join('|');
  for(const [field,label]of Object.entries(aliases)){
    const pattern=new RegExp('(?:^|[\\n;]|\\s)(?:'+label+')\\s*[:=]\\s*([\\s\\S]*?)(?=\\s*(?:[\\n;]|(?:'+labels+')\\s*[:=])|$)','i');
    const m=String(text).match(pattern);if(m)result[field]=m[1].trim();
  }
  return result;
}
export const identityFields=['name','title','zone','section','contact','leadership','coordinator','mother','cpf','rg','birth','notes'];
export function sameRecord(a,b){return identityFields.every(k=>String(a?.[k]??'')===String(b?.[k]??''))&&Boolean(a?.deleted)===Boolean(b?.deleted);}
