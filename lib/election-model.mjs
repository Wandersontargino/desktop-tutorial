export const YEAR = 2026;
export const OFFICE_LABELS = { estadual: 'Deputado Estadual', federal: 'Deputado Federal' };
const integer = n => Number.isSafeInteger(n) && n >= 0;
const clean = s => typeof s === 'string' && s.length > 0 && s.length < 200;
function requireValue(test, message) { if (!test) throw new Error(message); }

export function cityPlaces(city) {
  const places=new Map();
  for(const s of city.s){
    const place=String(s[2]||'').trim();if(!place||/local n[aã]o informado/i.test(place))continue;
    const key=JSON.stringify([s[0],place,s[3]||'']);
    if(!places.has(key))places.set(key,{city:String(city.m[0]),cityName:city.m[1],zone:String(s[0]),place,neighborhood:s[3]||'',sections:[]});
    places.get(key).sections.push(String(s[1]));
  }
  return [...places.values()];
}

export function validateCity(city, office, allowedCodes) {
  requireValue(city?.y === YEAR && city?.o === office, 'Ano ou cargo incompatível.');
  const code = String(city.m?.[0] || '');
  requireValue(allowedCodes.has(code) && clean(city.m?.[1]), 'Município fora da base do Pará.');
  requireValue(Array.isArray(city.s) && city.s.length <= 15000 && Array.isArray(city.c) && city.c.length <= 3000, 'Estrutura municipal inválida.');
  const sectionKeys = new Set();
  for (const s of city.s) {
    requireValue(Array.isArray(s) && Number.isSafeInteger(s[0]) && s[0] > 0 && Number.isSafeInteger(s[1]) && s[1] > 0 && typeof s[2] === 'string' && typeof s[3] === 'string' && s[2].length <= 300 && s[3].length <= 200, 'Zona, seção ou local inválido.');
    const key = s[0] + '|' + s[1];
    requireValue(!sectionKeys.has(key), 'Seção duplicada na base.'); sectionKeys.add(key);
  }
  const ids = new Set(); let total = 0;
  const candidates = city.c.map(c => {
    requireValue(Array.isArray(c) && /^\d{1,20}$/.test(String(c[0])) && /^\d{1,8}$/.test(String(c[1])) && clean(c[2]) && integer(c[3]) && Array.isArray(c[5]), 'Candidatura inválida.');
    requireValue(!ids.has(String(c[0])), 'Candidatura duplicada.'); ids.add(String(c[0]));
    let sum = 0; const seen = new Set();
    for (const pair of c[5]) {
      requireValue(Array.isArray(pair) && integer(pair[0]) && pair[0] < city.s.length && integer(pair[1]) && pair[1] > 0 && !seen.has(pair[0]), 'Votação por seção inválida ou duplicada.');
      seen.add(pair[0]); sum += pair[1];
    }
    requireValue(sum === c[3], 'Total do candidato diferente da soma das seções.');
    total += sum; return [String(c[0]), String(c[1]), c[2], sum];
  });
  requireValue(integer(city.x?.[0]) && city.x?.[1] === total && integer(total), 'Total municipal divergente.');
  const sorted = [...city.c].sort((a,b) => b[3]-a[3] || a[2].localeCompare(b[2], 'pt-BR'));
  let rank = 0, prior = -1;
  sorted.forEach((c,i) => { if (c[3] !== prior) rank=i+1; prior=c[3]; c[4]=rank; });
  return { code, name: city.m[1], sections: city.s.length, rows: city.x[0], votes: total, candidates, places:cityPlaces(city) };
}

export function buildBase(summaries, office, template, provenance) {
  requireValue(OFFICE_LABELS[office] && summaries.length === 144, 'A atualização exige os 144 municípios do Pará.');
  const regionByCity = new Map(template.municipalities.map(([code,,region]) => [String(code), region]));
  const allowed = new Set(regionByCity.keys()), seen = new Set(), candidates = new Map();
  const regions = new Map(template.regions.map(([id]) => [id,0]));
  let votes=0, sections=0, rows=0;
  for (const city of summaries) {
    requireValue(allowed.has(city.code) && !seen.has(city.code), 'Município ausente ou duplicado.'); seen.add(city.code);
    votes += city.votes; sections += city.sections; rows += city.rows;
    const region = regionByCity.get(city.code); regions.set(region, regions.get(region)+city.votes);
    for (const c of city.candidates) {
      let a = candidates.get(c[0]);
      if (!a) { a = { id:c[0], number:c[1], name:c[2], total:0, municipalities:[], regions:new Map() }; candidates.set(c[0],a); }
      requireValue(a.number === c[1] && a.name === c[2], 'Identidade do candidato divergente entre municípios.');
      a.total += c[3]; if(c[3]>0) a.municipalities.push([city.code,c[3]]);
      a.regions.set(region, (a.regions.get(region)||0)+c[3]);
    }
  }
  const ranked=[...candidates.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'pt-BR'));
  let rank=0, prior=-1; ranked.forEach((c,i)=>{if(c.total!==prior)rank=i+1;prior=c.total;c.rank=rank;});
  const ordered=[...candidates.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')||a.number.localeCompare(b.number));
  summaries.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  const source = `TSE — ${OFFICE_LABELS[office]} 2026 • ${provenance.sourceGeneration || 'arquivo importado pelo responsável'}`;
  const index = { electionYear:YEAR, office, turn:1, title:`${OFFICE_LABELS[office]} — 1º turno de 2026`, source, provenance,
    municipalities:summaries.map(c=>[c.code,c.name,c.candidates.length,c.sections,c.rows,c.votes]),
    totals:{municipalities:144,candidates:ordered.length,sections,rows,votes} };
  const statewide = { electionYear:YEAR,office,totalVotes:votes,municipalities:summaries.map(c=>[c.code,c.name]),
    candidates:ordered.map(c=>[c.id,c.number,c.name,c.total,c.rank,c.municipalities.length,c.municipalities.sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))]) };
  const regional = { ...template, sources:{...template.sources,current:source},
    totals:{...template.totals,current:template.regions.map(([id])=>[id,regions.get(id)])},
    currentCandidates:ordered.map(c=>[c.id,template.regions.map(([id])=>[id,c.regions.get(id)||0])]) };
  const places={electionYear:YEAR,office,turn:1,source,places:summaries.flatMap(c=>c.places||[])};
  return { index, statewide, regional, places };
}
