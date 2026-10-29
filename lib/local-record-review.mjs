import {normalize,digits} from './crm-model.mjs';

const particles=new Set(['DA','DAS','DE','DO','DOS','E']);
const words=value=>normalize(value).replace(/[^A-Z ]/g,' ').split(/\s+/).filter(w=>w.length>1&&!particles.has(w)).slice(0,12);
const nameKey=value=>words(value).sort().join(' ');
function birthKey(value){
  const raw=String(value||'').trim(),match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)||raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(!match)return '';
  const [year,month,day]=match[1].length===4?match.slice(1):[match[3],match[2],match[1]],date=new Date(`${year}-${month}-${day}T12:00:00Z`);
  return Number.isFinite(+date)&&date.getUTCFullYear()===+year&&date.getUTCMonth()+1===+month&&date.getUTCDate()===+day?`${year}-${month}-${day}`:'';
}
// Bounded edit distance, including adjacent transpositions. This measures spelling,
// never a probability of identity. Candidate blocking keeps large bases bounded.
function editDistance(a,b,max){
  if(Math.abs(a.length-b.length)>max)return max+1;
  let prior=Array.from({length:b.length+1},(_,i)=>i),older;
  for(let i=1;i<=a.length;i++){
    const row=[i];let best=i;
    for(let j=1;j<=b.length;j++){
      row[j]=Math.min(row[j-1]+1,prior[j]+1,prior[j-1]+(a[i-1]!==b[j-1]));
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])row[j]=Math.min(row[j],older[j-2]+1);
      best=Math.min(best,row[j]);
    }
    if(best>max)return max+1;older=prior;prior=row;
  }
  return prior[b.length];
}

export function findSimilarRecords(records,groups=[],{limit=30,budget=20000,bucketLimit=250}={}){
  const membership=new Map(groups.flatMap(g=>g.records.map(r=>[r.id,g.id]))),index=new Map(),seen=new Set(),matches=[];
  let examined=0,limited=false;
  const rows=records.filter(r=>r.id).map(record=>({record,name:nameKey(record.name),tokens:words(record.name),birth:birthKey(record.birth),mother:nameKey(record.mother)})).filter(r=>r.tokens.length>=2&&r.name.length>=10).sort((a,b)=>a.record.id.localeCompare(b.record.id));
  for(const row of rows){
    const tokens=[...new Set(row.tokens.filter(w=>w.length>=3))].sort(),keys=[];
    for(let i=0;i<tokens.length;i++)for(let j=i+1;j<tokens.length;j++)keys.push('N:'+tokens[i]+'|'+tokens[j]);
    const first=row.tokens[0].slice(0,2);
    if(row.birth)keys.push('B:'+row.birth+'|'+first);
    if(row.mother.split(' ').length>=2)keys.push('M:'+row.mother+'|'+first);
    const candidates=new Set(keys.flatMap(key=>index.get(key)||[]));
    for(const other of candidates){
      if(row.record.deleted&&other.record.deleted)continue;
      if(membership.has(row.record.id)&&membership.get(row.record.id)===membership.get(other.record.id))continue;
      const id=[row.record.id,other.record.id].sort().join('|');if(seen.has(id))continue;seen.add(id);
      if(examined>=budget){limited=true;break;}examined++;
      if(row.tokens.length!==other.tokens.length||normalize(row.record.name)===normalize(other.record.name))continue;
      const max=Math.max(1,Math.min(3,Math.floor(Math.max(row.name.length,other.name.length)*.08))),distance=editDistance(row.name,other.name,max);
      if(distance>max)continue;
      const sameBirth=!!row.birth&&row.birth===other.birth,sameMother=row.mother.split(' ').length>=2&&row.mother===other.mother;
      if(row.tokens.length<3&&!sameBirth&&!sameMother)continue;
      const reasons=[distance===0?'Nome equivalente ao desconsiderar a ordem e as partículas do nome.':'Nome com pequena diferença de escrita.',...(sameMother?['Nome da mãe coincidente.']:[]),...(sameBirth?['Data de nascimento coincidente.']:[])];
      const warnings=[];
      for(const [key,label]of [['cpf','CPF'],['title','Título']]){const a=digits(row.record[key]),b=digits(other.record[key]);if(a&&b&&a!==b)warnings.push(label+' divergente.');}
      if(row.mother&&other.mother&&!sameMother)warnings.push('Nome da mãe divergente.');
      if(row.birth&&other.birth&&!sameBirth)warnings.push('Nascimento divergente.');
      matches.push({id,records:[other.record,row.record],reasons,warnings,distance,anchors:+sameBirth+ +sameMother});
    }
    if(examined>=budget){limited=true;break;}
    for(const key of keys){if(!index.has(key))index.set(key,[]);const bucket=index.get(key);if(bucket.length<bucketLimit)bucket.push(row);else limited=true;}
  }
  matches.sort((a,b)=>b.anchors-a.anchors||a.distance-b.distance||a.id.localeCompare(b.id));
  return {matches:matches.slice(0,limit),limited:limited||matches.length>limit,examined};
}

export function suggestDuplicateObservation(group){
  if(!group||group.status==='resolved')return '';
  if(group.eligible)return 'Sugestão pendente de confirmação pelo responsável. A verificação automática encontrou dados coincidentes e ordem de criação comprovada. Após conferir os documentos, manter o cadastro mais antigo ativo e arquivar as repetições com histórico e cópia protegida. Esta sugestão não executa o tratamento.';
  return ['Revisão documental pendente.',...(group.blockers||[]),'Cadastros preservados para conferência. A sugestão não confirma a identidade nem executa arquivamento.'].join(' ').slice(0,1600);
}
