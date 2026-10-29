(function(root){
  'use strict';
  const number=value=>Number.isSafeInteger(value)&&value>=0;
  function election(index,manifest,office){
    const errors=[],rows=Array.isArray(index?.municipalities)?index.municipalities:[],seen=new Set(),totals=index?.totals||{};
    if(!manifest?.active)errors.push('Versão ativa não confirmada pelo servidor.');
    if(index?.electionYear!==2026||index?.office!==office||(index?.turn!==undefined&&index.turn!==1))errors.push('Ano ou cargo diferente do recorte de 2026.');
    for(const row of rows){if(!Array.isArray(row)){errors.push('Linha municipal inválida.');continue;}if(seen.has(String(row[0])))errors.push('Município repetido: '+row[0]);seen.add(String(row[0]));if(!number(row[3])||!number(row[5]))errors.push('Quantidade inválida no município '+row[0]);}
    if(rows.length!==144||seen.size!==144||totals.municipalities!==144)errors.push('A cobertura não corresponde aos 144 municípios.');
    for(const [key,column]of [['sections',3],['votes',5]])if(!number(totals[key])||rows.reduce((sum,row)=>sum+Number(row?.[column]),0)!==totals[key])errors.push('Soma municipal divergente: '+key+'.');
    return {office,version:manifest?.active||'',revision:manifest?.revision??null,source:index?.source||'Fonte não informada',updatedAt:manifest?.updatedAt||index?.provenance?.appliedAt||'',municipalities:seen.size,sections:totals.sections??null,votes:totals.votes??null,errors,ok:!errors.length};
  }
  function regions(regional,index){
    const regions=Array.isArray(regional?.regions)?regional.regions:[],cities=Array.isArray(regional?.municipalities)?regional.municipalities:[],ids=new Set(regions.map(row=>String(row?.[0]))),codes=new Set(),errors=[];
    if(regions.length!==13||ids.size!==13)errors.push('A configuração deve conter 13 regiões distintas.');
    for(const row of cities){if(!Array.isArray(row)){errors.push('Vínculo regional inválido.');continue;}if(codes.has(String(row[0])))errors.push('Município em mais de uma região: '+row[0]);codes.add(String(row[0]));if(!ids.has(String(row[2])))errors.push('Região não cadastrada para '+row[1]);}
    if(cities.length!==144||codes.size!==144)errors.push('A divisão regional deve abranger os 144 municípios uma vez.');
    if(index){const expected=new Set((index.municipalities||[]).map(row=>String(row?.[0])));if(expected.size!==codes.size||[...expected].some(code=>!codes.has(code)))errors.push('Municípios da divisão regional diferem da base eleitoral.');}
    return {regions:regions.length,municipalities:codes.size,errors,ok:!errors.length};
  }
  function difference(before,after){
    const old=new Map((before.municipalities||[]).map(row=>[String(row[0]),row])),current=new Map((after.municipalities||[]).map(row=>[String(row[0]),row])),rows=[];
    for(const code of new Set([...old.keys(),...current.keys()])){const a=old.get(code),b=current.get(code);if(!a||!b||a[3]!==b[3]||a[5]!==b[5]||a[2]!==b[2]||a[4]!==b[4])rows.push({code,name:b?.[1]||a[1],status:!a?'Incluído':!b?'Ausente':'Alterado',before:a?.[5]??null,after:b?.[5]??null,delta:a&&b?b[5]-a[5]:null,sectionsBefore:a?.[3]??null,sectionsAfter:b?.[3]??null});}
    rows.sort((a,b)=>Math.abs(b.delta||0)-Math.abs(a.delta||0)||a.name.localeCompare(b.name,'pt-BR'));
    return {rows,changed:rows.length,unchanged:[...current.keys()].filter(code=>old.has(code)&&!rows.some(row=>row.code===code)).length};
  }
  function synchronization(crm,online,local=false){
    if(!crm?.unlocked)return {tone:'neutral',label:'Base protegida',detail:'Desbloqueie para conferir cadastros e sincronização.'};
    if(crm.conflicts)return {tone:'error',label:'Conflitos para revisão',detail:crm.conflicts+' conflito(s). Nenhuma versão será descartada automaticamente.'};
    if(crm.pending||crm.locationDrafts||crm.inflight)return {tone:'warning',label:'Alterações neste aparelho',detail:(crm.pending||0)+' cadastro(s), '+(crm.locationDrafts||0)+' ponto(s) e '+(crm.inflight?'envio em conferência.':'envio pendente.')};
    if(!online)return {tone:'warning',label:'Consulta offline',detail:'Usando a cópia preparada neste aparelho; atualizações dependem de conexão.'};
    if(!crm.lastOnline)return {tone:'warning',label:'Conferência central pendente',detail:'Atualize a base para confirmar a revisão disponível.'};
    return {tone:'ok',label:local?'Cópia local conferida':'Base central conferida',detail:local?'Este banco pertence a este computador e não sincroniza automaticamente com o site.':'Sem alterações locais pendentes; última conferência em '+new Date(crm.lastOnline).toLocaleString('pt-BR')+'.'};
  }
  const api={election,regions,difference,synchronization};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PlatformAudit=api;
})(typeof window!=='undefined'?window:globalThis);
