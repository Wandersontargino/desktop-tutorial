import {normalize} from '../lib/crm-model.mjs';
import {geometryRings,insideGeometry} from '../lib/leadership-location.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const clean=(s,max)=>String(s??'').trim().replace(/\s+/g,' ').slice(0,max);
const recent=new Map();
const folded=value=>normalize(value).toLowerCase();
const streetKinds={r:'rua',rua:'rua',tv:'travessa',tr:'travessa',trav:'travessa',travessa:'travessa',av:'avenida',avenida:'avenida',al:'alameda',alameda:'alameda',rod:'rodovia',rodovia:'rodovia',est:'estrada',estrada:'estrada'};
function streetParts(value){
  const words=folded(value).replace(/\([^)]*\)/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/([a-z])([0-9])/g,'$1 $2').trim().split(/\s+/);
  const kind=streetKinds[words[0]]||'';if(kind)words.shift();
  return {kind,core:words.join(' ')};
}
function sameStreet(a,b){const x=streetParts(a),y=streetParts(b);return !!x.core&&x.core===y.core&&(!x.kind||!y.kind||x.kind===y.kind);}
function searchableStreet(value){const x=streetParts(value);return [x.kind,x.core].filter(Boolean).join(' ');}
function streetCandidate(feature,address,postalCode,city){
  const p=feature.properties||{},type=folded(p.type),key=folded(p.osm_key),value=folded(p.osm_value);
  if(feature.geometry?.type!=='Point'||feature.geometry.coordinates?.length!==2||!feature.geometry.coordinates.every(Number.isFinite)||!insideGeometry(feature.geometry.coordinates,city.geometry))return false;
  if(['city','town','village','suburb','district','county','state','country','postcode','postalcode','locality','municipality','administrative'].includes(type)||key==='boundary'||key==='place')return false;
  // A matching name alone is not enough: demand an actual road or address.
  const road=key==='highway'||type==='street',house=type==='house'||!!p.housenumber;
  if(!road&&!house)return false;
  const street=p.street||(road?p.name:'');if(!sameStreet(street,address))return false;
  const returnedPostal=clean(p.postcode,20).replace(/\D/g,'');
  if(postalCode&&returnedPostal&&returnedPostal!==postalCode)return false;
  if(p.countrycode&&folded(p.countrycode)!=='br')return false;
  if(p.city&&normalize(p.city)!==normalize(city.properties.name))return false;
  if(value==='administrative')return false;
  return true;
}
export async function lookupAddress(input,features,env={}){
  const address=clean(input.address,240),number=clean(input.addressNumber,30),postalCode=clean(input.postalCode,9).replace('-',''),city=features.find(f=>String(f.properties.code)===String(input.cityCode));
  if(!city||address.length<3||!number)throw fail('Preencha município, rua e número da casa para localizar o endereço.');
  if(postalCode&&!/^\d{8}$/.test(postalCode))throw fail('Confira o CEP com 8 dígitos.');
  const query=[searchableStreet(address)+' '+number,city.properties.name,'Pará','Brasil'].join(', '),key=normalize(query)+'|'+postalCode,cached=recent.get(key);
  if(cached&&Date.now()-cached.at<3600000)return cached.result;
  const endpoint=new URL(env.GEOCODER_URL||'https://photon.komoot.io/api/');
  if(endpoint.protocol!=='https:')throw fail('A busca de endereço está indisponível.',503);
  const points=geometryRings(city.geometry).flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  endpoint.search=new URLSearchParams({q:query,limit:'8',countrycode:'BR',bbox:[Math.min(...xs)-.015,Math.min(...ys)-.015,Math.max(...xs)+.015,Math.max(...ys)+.015].join(',')});
  endpoint.searchParams.append('layer','house');endpoint.searchParams.append('layer','street');
  try{
    const response=await fetch(endpoint,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/json','User-Agent':'AnaliseEleitoralPara/1.7 address-reference'}});
    if(!response.ok)throw fail('Não foi possível consultar o endereço. Use o CEP, o GPS ou marque o ponto no mapa.',503);
    const data=await response.json();
    const candidates=(Array.isArray(data.features)?data.features:[]).filter(f=>streetCandidate(f,address,postalCode,city));
    const match=candidates.find(f=>normalize(f.properties?.housenumber)===normalize(number))||candidates.find(f=>!f.properties?.housenumber);
    if(!match)throw fail('Não encontramos a rua ou a casa com segurança. Um resultado do centro do município não será usado. Confira o endereço, use o GPS no local ou marque o ponto no mapa.',404);
    const [longitude,latitude]=match.geometry.coordinates,result={longitude,latitude,source:'address',provider:'Photon / OpenStreetMap',precision:normalize(match.properties?.housenumber)===normalize(number)?'house':'street',matchedNumber:clean(match.properties?.housenumber,30),matchedStreet:clean(match.properties?.street||match.properties?.name,240),cityCode:String(city.properties.code)};
    if(recent.size>=100)recent.delete(recent.keys().next().value);recent.set(key,{at:Date.now(),result});return result;
  }catch(e){if(e.status)throw e;throw fail('A consulta de endereço não respondeu. Você pode usar o CEP, o GPS ou marcar o ponto manualmente.',503);}
}
