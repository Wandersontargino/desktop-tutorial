(function (root) {
  "use strict";
  const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const voteNumber = new Intl.NumberFormat("pt-BR");
  const votePercent = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function createAggregator(scopeName,candidateRoster=[],scopeCode="__region__") {
    let year,office,work=0;
    const sections=[],candidates=new Map(),totals=[0,0],codes=[];
    candidateRoster.forEach(c=>candidates.set(String(c[0]),[String(c[0]),c[1],c[2],0,0,[]]));
    function* addSteps(city){
      if(!codes.length){year=city.y;office=city.o;}
      if(city.y!==year||city.o!==office)throw new Error("Bases de eleições ou cargos diferentes.");
      if(codes.includes(String(city.m[0])))throw new Error("Município repetido no recorte.");
      const offset=sections.length;
      for(const section of city.s){
        sections.push([section[0],section[1],`${section[2]||"Local não informado"} • ${city.m[1]}`,`${section[3]||"Bairro não informado"} • ${city.m[1]}`,String(city.m[0]),section[2]||"Local não informado",section[3]||"Bairro não informado"]);
        if(++work>=4000){work=0;yield;}
      }
      for(const candidate of city.c){
        const id=String(candidate[0]);if(!candidates.has(id))candidates.set(id,[id,candidate[1],candidate[2],0,0,[]]);
        const combined=candidates.get(id);combined[3]+=candidate[3];
        for(const [index,votes] of candidate[5]){combined[5].push([offset+index,votes]);if(++work>=4000){work=0;yield;}}
      }
      totals[0]+=Number(city.x?.[0])||0;totals[1]+=Number(city.x?.[1])||0;codes.push(String(city.m[0]));
    }
    function addCity(city){for(const _ of addSteps(city)){} }
    async function addCityAsync(city,options={}){
      for(const _ of addSteps(city)){
        if(options.isCancelled?.())throw Object.assign(new Error('Consulta cancelada.'),{name:'AbortError'});
        await (options.yieldControl||(()=>new Promise(r=>setTimeout(r,0))))();
      }
    }
    function finish(){
      if(!codes.length)throw new Error("Recorte sem municípios.");
      const rows=[...candidates.values()].sort((a,b)=>b[3]-a[3]||a[2].localeCompare(b[2],"pt-BR"));
      rows.forEach((c,i)=>{c[4]=i>0&&c[3]===rows[i-1][3]?rows[i-1][4]:i+1;});
      return {y:year,o:office,m:[scopeCode,scopeName],s:sections,c:rows,x:totals,municipalityCodes:codes,isRegional:true,isStatewide:scopeCode==="__state__"};
    }
    return {addCity,addCityAsync,finish};
  }
  function aggregateCities(cities,scopeName,candidateRoster=[],scopeCode="__region__"){
    const aggregator=createAggregator(scopeName,candidateRoster,scopeCode);
    for(const city of cities)aggregator.addCity(city);return aggregator.finish();
  }
  async function aggregateCitiesAsync(cities,scopeName,candidateRoster=[],scopeCode="__region__",options={}){
    const aggregator=createAggregator(scopeName,candidateRoster,scopeCode),yieldControl=options.yieldControl||(()=>new Promise(r=>setTimeout(r,0)));
    for(let i=0;i<cities.length;i++){
      if(options.isCancelled?.())throw Object.assign(new Error('Consulta cancelada.'),{name:'AbortError'});
      await aggregator.addCityAsync(cities[i],options);options.onProgress?.({completed:i+1,total:cities.length});await yieldControl();
    }
    return aggregator.finish();
  }

  function previousCandidate(candidate, previousCandidates, currentCandidates) {
    if (!candidate) return null;
    const name = normalize(candidate[2]);
    const matches = previousCandidates.filter((item) => normalize(item[2]) === name);
    const currentMatches = currentCandidates.filter((item) => normalize(item[2]) === name);
    // Do not choose a homonym by ballot number or vote totals.
    return matches.length === 1 && currentMatches.length === 1 ? matches[0] : null;
  }

  function change(current, previous) {
    if (current == null || previous == null || !Number.isSafeInteger(Number(current)) || !Number.isSafeInteger(Number(previous)) || current < 0 || previous < 0)
      return { label: "Sem comparação", className: "", difference: null, percentage: null, percentLabel: "—" };
    const difference = Number(current) - Number(previous);
    const percentage = previous > 0 ? difference / previous * 100 : null;
    const percentLabel = percentage === null ? "Sem base percentual" : `${difference > 0 ? "+" : ""}${votePercent.format(percentage)}%`;
    return { label: `${difference > 0 ? "+" : ""}${voteNumber.format(difference)} ${Math.abs(difference) === 1 ? "voto" : "votos"} (${percentLabel})`,
      className: difference > 0 ? "vote-up" : difference < 0 ? "vote-down" : "", difference, percentage, percentLabel };
  }
  const api = { createAggregator, aggregateCities, aggregateCitiesAsync, previousCandidate, change };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ElectoralScope = api;
})(typeof window !== "undefined" ? window : globalThis);
