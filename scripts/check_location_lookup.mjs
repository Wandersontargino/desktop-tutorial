import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lookupAddress} from '../worker/address.mjs';
import {lookupCep} from '../worker/cep.mjs';
import {neighborhoodTransform,streetTiles} from '../lib/leadership-basemap.mjs';
import {projectPoint,cleanLeadershipLocation,hasPoint,locationStatus,clusterLocations} from '../lib/leadership-location.mjs';
const features=JSON.parse(readFileSync('public/pa-municipal-map.json')).features;
const metadata=JSON.parse(readFileSync('public/ananindeua-neighborhood-map.json'));
const city=features.find(f=>f.properties.name==='ANANINDEUA'),input={cityCode:String(city.properties.code),address:'Rodovia BR-316',addressNumber:'1515',postalCode:'67020-010'};
const original=globalThis.fetch;let calls=0,reply;
globalThis.fetch=async(url)=>{calls++;assert.equal(new URL(url).protocol,'https:');return new Response(JSON.stringify(reply),{headers:{'content-type':'application/json'}});};
try{
  await assert.rejects(()=>lookupAddress({...input,addressNumber:''},features),/número/);assert.equal(calls,0);
  const candidate=(street,number,coordinates=[-48.3719733,-1.3663891],extra={})=>({type:'Feature',properties:{street,housenumber:number,type:number?'house':'street',osm_key:number?'building':'highway',...extra},geometry:{type:'Point',coordinates}});
  reply={features:[candidate('Outra rua','1515'),candidate('Rodovia BR-316','1514'),candidate('Rodovia BR-316','1515')]};
  const exact=await lookupAddress(input,features);assert.equal(exact.precision,'house');assert.equal(exact.matchedNumber,'1515');assert.equal(exact.source,'address');
  await lookupAddress(input,features);assert.equal(calls,1,'same-address requests reuse bounded cache');
  reply={features:[candidate('Rodovia BR-316','1514'),candidate('Rodovia BR-316',undefined)]};
  const street=await lookupAddress({...input,addressNumber:'99999'},features);assert.equal(street.precision,'street');
  reply={features:[candidate('Rodovia BR-316','99998',[-48.49,-1.4558])]};
  await assert.rejects(()=>lookupAddress({...input,addressNumber:'99998'},features),/segurança/);
  reply={features:[candidate('Rodovia BR-316','99996',[null,null])]};
  await assert.rejects(()=>lookupAddress({...input,addressNumber:'99996'},features),/segurança/);
  const stored=cleanLeadershipLocation({leadership:'TESTE',version:0,cityCode:input.cityCode,reference:'Sede',latitude:exact.latitude,longitude:exact.longitude,source:'address',addressPrecision:'house',confirmed:false},features);assert.equal(stored.addressPrecision,'house');assert.equal(stored.confirmed,false);
  reply={cep:'67020010',state:'PA',city:'Ananindeua',street:'Rodovia BR-316',neighborhood:'Centro',location:{coordinates:{longitude:'-48.3719733',latitude:'-1.3663891'}}};
  const cep=await lookupCep('67020-010',features);assert.equal(cep.cityCode,input.cityCode);assert.equal(cep.source,'cep');
  assert.equal(cep.latitude,null);assert.equal(cep.longitude,null,'unverified CEP municipal coordinates must never become a pin');assert.equal(cep.precision,'address-only');
  const legacy=cleanLeadershipLocation({leadership:'CEP FICTÍCIO ANTIGO',version:1,cityCode:input.cityCode,reference:'Referência de teste',postalCode:'67020010',source:'cep',latitude:-1.3663891,longitude:-48.3719733,confirmed:false},features);
  assert.equal(hasPoint(legacy),false);assert.equal(locationStatus(legacy,features).cepReviewRequired,true);assert.equal(legacy.latitude,-1.366389,'stored coordinate preserved for review');
  const [x,y]=projectPoint([legacy.longitude,legacy.latitude]);assert.equal(clusterLocations([legacy],[x-.0001,y-.0001,.0002,.0002]).length,0,'unreviewed CEP points excluded from markers/clusters');
  assert.equal(hasPoint({...legacy,source:'map'}),true);assert.equal(hasPoint({...legacy,confirmed:true}),true,'explicit manual confirmation remains valid');
  reply={features:[candidate('Travessa WE-45',undefined)]};
  const alias=await lookupAddress({...input,address:'TV. WE 45 (Quadra fictícia)',addressNumber:'542',postalCode:''},features);assert.equal(alias.precision,'street');assert.equal(alias.matchedStreet,'Travessa WE-45');
  reply={features:[candidate('Travessa WE45','543'),candidate('Travessa WE-45','542')]};
  const houseAlias=await lookupAddress({...input,address:'TV WE45',addressNumber:'542',postalCode:'67020011'},features);assert.equal(houseAlias.precision,'house');assert.equal(houseAlias.matchedNumber,'542');
  for(const bad of [
    candidate('Travessa WE-45',undefined,undefined,{type:'city',osm_key:'place',name:'Ananindeua'}),
    candidate('Travessa WE-45',undefined,undefined,{type:'district',osm_key:'boundary'}),
    candidate('Travessa WE-45',undefined,undefined,{postcode:'00000-000'}),
    candidate('Travessa WE-145',undefined),candidate('Rua WE-45',undefined),
    candidate('Travessa WE-45',undefined,undefined,{countrycode:'PT'}),
    candidate('Travessa WE-45',undefined,undefined,{city:'Belém'}),
  ]){
    reply={features:[bad]};await assert.rejects(()=>lookupAddress({...input,address:'TV WE45',addressNumber:'999',postalCode:'67020012'},features),/centro do município|segurança/);
  }
  reply={features:[{type:'Feature',properties:{name:'TV WE45'},geometry:{type:'Point',coordinates:[-48.3719733,-1.3663891]}}]};
  await assert.rejects(()=>lookupAddress({...input,address:'TV WE45',addressNumber:'998',postalCode:''},features),/segurança/);
  reply={cep:'67020012',state:'PA',city:'Ananindeua',street:'Rua fictícia',neighborhood:'Bairro fictício',location:{coordinates:{longitude:'-48.49',latitude:'-1.4558'}}};
  const wrongPoint=await lookupCep('67020012',features);assert.equal(wrongPoint.latitude,null);assert.equal(wrongPoint.longitude,null);
  reply={...reply,cep:'01001000',state:'SP'};await assert.rejects(()=>lookupCep('01001000',features),/Pará/);
}finally{globalThis.fetch=original;}
const matrix=neighborhoodTransform(metadata.corners),bottomRight=projectPoint(metadata.corners.bottomRight);
assert.ok(Math.hypot(matrix[0]+matrix[2]+matrix[4]-bottomRight[0],matrix[1]+matrix[3]+matrix[5]-bottomRight[1])<0.000001,'official georeferencing remains aligned');
const topLeft=projectPoint(metadata.corners.topLeft);assert.equal(matrix[4],topLeft[0]);assert.equal(matrix[5],topLeft[1]);
for(const view of [[-1,.01,.004,.004],[-1,.01,.8,.8]]){const tiles=streetTiles(view);assert.ok(tiles.length<=64);assert.ok(tiles.every(t=>t.url.startsWith('https://tile.openstreetmap.org/')));}
console.log('Location lookup passed: CEP fills postal fields without unverified pins; legacy CEP coordinates retained but hidden pending review; street aliases and house/street distinction; city-centroid, boundary, different street/postcode/country/city and invalid point rejected; bounded cache and neighborhood alignment.');
