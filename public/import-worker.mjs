import { validateCity, buildBase } from './election-model.mjs';
const clean = value => ['#NULO#','#NE#'].includes(value) ? '' : String(value||'').trim();
const digits = value => /^\d+$/.test(value) ? String(Number(value)) : '';
function parseLine(line) {
  const cells=[];let value='',quoted=false;
  for(let i=0;i<line.length;i++) {
    const char=line[i];
    if(char==='"') { if(quoted && line[i+1]==='"'){value+='"';i++;}else quoted=!quoted; }
    else if(char===';'&&!quoted){cells.push(value);value='';}else value+=char;
  }
  if(quoted)throw new Error('Linha CSV com aspas incompletas. Use o arquivo original do TSE.');
  cells.push(value.replace(/\r$/,''));return cells;
}
async function readCSV(file,required,onRow,onProgress,encoding='auto') {
  if(!file||!file.name.toLowerCase().endsWith('.csv'))throw new Error('Selecione o CSV extraído do ZIP oficial do TSE.');
  if(file.size>1500000000)throw new Error('Use o arquivo do Pará, com tamanho de até 1,5 GB.');
  if(encoding==='auto') { try { new TextDecoder('utf-8',{fatal:true}).decode(await file.slice(0,65536).arrayBuffer(),{stream:file.size>65536});encoding='utf-8'; }catch{encoding='windows-1252';} }
  const decoder=new TextDecoder(encoding,{fatal:encoding==='utf-8'}),reader=file.stream().getReader();
  let carry='',header=null,lineNumber=0,read=0;
  const line=text=>{
    lineNumber++;if(!text.trim())return;
    const cells=parseLine(text.replace(/^\uFEFF/,''));
    if(!header){header=new Map(cells.map((s,i)=>[s.trim().toUpperCase(),i]));const missing=required.filter(s=>!header.has(s)&&!(s==='ANO_ELEICAO'&&header.has('AA_ELEICAO')));if(missing.length)throw new Error('CSV incompatível. Faltam colunas: '+missing.join(', '));return;}
    if(cells.length!==header.size)throw new Error('Quantidade de colunas inválida na linha '+lineNumber+'.');
    onRow(name=>clean(cells[header.get(name)??(name==='ANO_ELEICAO'?header.get('AA_ELEICAO'):undefined)]),lineNumber);
  };
  try {
    while(true){const {done,value}=await reader.read();if(done)break;read+=value.byteLength;carry+=decoder.decode(value,{stream:true});let start=0,i;while((i=carry.indexOf('\n',start))!==-1){line(carry.slice(start,i));start=i+1;}carry=carry.slice(start);if(carry.length>100000)throw new Error('Linha muito extensa no arquivo CSV.');onProgress?.(read/file.size);}
    carry+=decoder.decode();if(carry.trim())line(carry);
    if(!header)throw new Error('O arquivo está vazio.');
  } finally { reader.releaseLock(); }
}
function requireContext(get,line,cargo=null) {
  if(get('SG_UF')!=='PA'||(cargo&&get('CD_CARGO')!==cargo))return false;
  if(Number(get('ANO_ELEICAO'))!==2026)throw new Error('Arquivo de outro ano na linha '+line+'. A base atual aceita somente 2026.');
  if(cargo&&Number(get('NR_TURNO'))!==1)throw new Error('Turno incompatível na linha '+line+'. Use o 1º turno.');
  return true;
}
export async function prepareImport({file,locationsFile,office,template,dataURL,dataVersion='bundled',encoding='auto'},progress=()=>{}) {
  const allowed=new Set(template.municipalities.map(m=>String(m[0]))),locations=new Map();
  if(locationsFile)await readCSV(locationsFile,['ANO_ELEICAO','SG_UF','CD_MUNICIPIO','NR_ZONA','NR_SECAO','NM_LOCAL_VOTACAO','NM_BAIRRO'],(get,line)=>{
    if(!requireContext(get,line)||get('NR_TURNO')&&Number(get('NR_TURNO'))!==1)return;const code=digits(get('CD_MUNICIPIO'));if(!allowed.has(code))throw new Error('Município desconhecido no arquivo de locais.');
    const zone=digits(get('NR_ZONA')),section=digits(get('NR_SECAO'));
    if(!zone||!section||Number(zone)<1||Number(zone)>999||Number(section)<1||Number(section)>9999)throw new Error('Zona ou seção inválida no arquivo de locais, linha '+line+'.');
    const key=[code,zone,section].join('|'),value=[get('NM_LOCAL_VOTACAO'),get('NM_BAIRRO')],prior=locations.get(key);
    const canonical=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
    if(prior&&prior.some((v,i)=>canonical(v)!==canonical(value[i])))throw new Error('Locais conflitantes para município '+code+', zona '+zone+', seção '+section+'. Confira a linha '+line+' antes de atualizar.');
    locations.set(key,value);
  },p=>progress({phase:'Locais de votação',percent:Math.round(p*15)}),encoding);
  if(locationsFile&&!locations.size)throw new Error('Nenhum local do Pará de 2026 e 1º turno foi encontrado neste arquivo.');
  const cities=new Map(),cargo=office==='federal'?'6':'7';let sourceGeneration='',nominalRows=0;
  await readCSV(file,['ANO_ELEICAO','NR_TURNO','SG_UF','CD_CARGO','CD_MUNICIPIO','NM_MUNICIPIO','NR_ZONA','NR_SECAO','SQ_CANDIDATO','NR_VOTAVEL','NM_VOTAVEL','QT_VOTOS'],(get,line)=>{
    if(!requireContext(get,line,cargo))return;
    const id=get('SQ_CANDIDATO');if(Number(id)<=0)return;
    const code=digits(get('CD_MUNICIPIO')),zone=Number(get('NR_ZONA')),section=Number(get('NR_SECAO')),votes=Number(get('QT_VOTOS'));
    if(!allowed.has(code)||!Number.isSafeInteger(zone)||zone<1||!Number.isSafeInteger(section)||section<1||!/^\d+$/.test(get('QT_VOTOS'))||!Number.isSafeInteger(votes))throw new Error('Município, zona, seção ou votos inválidos na linha '+line+'.');
    if(!sourceGeneration)sourceGeneration=[get('DT_GERACAO'),get('HH_GERACAO')].filter(Boolean).join(' às ');
    let city=cities.get(code);if(!city){city={y:2026,o:office,m:[code,get('NM_MUNICIPIO')],s:[],c:[],x:[0,0],sections:new Map(),candidates:new Map()};cities.set(code,city);}
    if(city.m[1]!==get('NM_MUNICIPIO'))throw new Error('Nome municipal divergente.');
    const key=zone+'|'+section;let idx=city.sections.get(key);
    if(idx===undefined){idx=city.s.length;city.sections.set(key,idx);const local=locations.get(code+'|'+key);city.s.push([zone,section,local?.[0]||get('NM_LOCAL_VOTACAO')||'Local não informado',local?.[1]||get('NM_BAIRRO')||'']);}
    let candidate=city.candidates.get(id);if(!candidate){candidate=[id,get('NR_VOTAVEL'),get('NM_VOTAVEL'),0,0,[]];candidate.seen=new Set();city.candidates.set(id,candidate);city.c.push(candidate);}
    if(candidate[1]!==get('NR_VOTAVEL')||candidate[2]!==get('NM_VOTAVEL'))throw new Error('Identidade do candidato divergente na linha '+line+'.');
    if(candidate.seen.has(idx))throw new Error('Votação duplicada para candidato e seção na linha '+line+'.');candidate.seen.add(idx);
    if(votes>0)candidate[5].push([idx,votes]);candidate[3]+=votes;city.x[0]++;city.x[1]+=votes;nominalRows++;
  },p=>progress({phase:'Validando votação de 2026',percent:15+Math.round(p*65)}),encoding);
  if(cities.size!==144||!nominalRows)throw new Error('Base incompleta: encontrados '+cities.size+' de 144 municípios. Use o arquivo completo do Pará para o cargo selecionado.');
  const results=[];let count=0,unknownPlaces=0,unknownNeighborhoods=0;
  for(const city of cities.values()) {
    if(!locationsFile && city.s.some(s=>!s[3]||s[2]==='Local não informado')){
      const response=await fetch(dataURL+encodeURIComponent(city.m[0])+'.json?version='+encodeURIComponent(dataVersion));
      if(!response.ok)throw new Error('Não foi possível consultar os locais atuais. Envie também o CSV de locais de 2026 ou tente novamente.');
      const old=await response.json();if(old.y!==2026||old.o!==office||String(old.m?.[0])!==String(city.m[0]))throw new Error('Locais de outro ano, cargo ou município.');
      const map=new Map(old.s.map(s=>[s[0]+'|'+s[1],s]));
      city.s.forEach(s=>{const prior=map.get(s[0]+'|'+s[1]);if(prior){if(s[2]==='Local não informado')s[2]=prior[2];if(!s[3])s[3]=prior[3];}});
    }
    city.s.forEach(s=>{if(s[2]==='Local não informado')unknownPlaces++;if(!s[3])unknownNeighborhoods++;});
    city.c.forEach(c=>delete c.seen);delete city.sections;delete city.candidates;
    validateCity(city,office,allowed);results.push(city);progress({phase:'Conferindo municípios e locais',percent:80+Math.round(++count/144*20)});
  }
  const provenance={sourceFile:file.name,sourceGeneration,locationsSource:locationsFile?.name||'Metadados da base de 2026 atualmente selecionada',year:2026,turn:1};
  const base=buildBase(results.map(c=>validateCity(c,office,allowed)),office,template,provenance);
  return {cities:results,base,provenance,unknownPlaces,unknownNeighborhoods};
}
if(typeof self!=='undefined' && typeof document==='undefined' && typeof self.postMessage==='function') self.onmessage=async(event)=>{
  try { const result=await prepareImport(event.data,p=>self.postMessage({type:'progress',...p}));self.postMessage({type:'ready',result}); }
  catch(error){self.postMessage({type:'error',message:error.message});}
};
