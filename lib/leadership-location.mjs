import {normalize} from './crm-model.mjs';

export const locationGroupId=r=>JSON.stringify([normalize(r.coordinator),normalize(r.leadership)]);
export const locationLabels={confirmed:'Confirmado',approximate:'Aproximado',pending:'Sem ponto'};
const text=(v,max)=>String(v??'').trim().replace(/\s+/g,' ').slice(0,max);
const number=v=>v===null||v===undefined||String(v).trim()===''?null:Number(String(v).replace(',','.'));
export function cleanLeadershipLocation(input,features){
  const value={leadership:text(input.leadership,80).toUpperCase(),coordinator:text(input.coordinator,100).toUpperCase(),version:Number(input.version??0),cityCode:text(input.cityCode,12),reference:text(input.reference,160),postalCode:text(input.postalCode,20).replace('-',''),address:text(input.address,240),addressNumber:text(input.addressNumber,30),addressExtra:text(input.addressExtra,160),neighborhood:text(input.neighborhood,100),notes:text(input.notes,600),latitude:number(input.latitude),longitude:number(input.longitude),confirmed:input.confirmed===true,source:['device','map','cep'].includes(input.source)?input.source:'manual',accuracy:input.source==='device'?number(input.accuracy):null};
  if(!value.leadership||!Number.isSafeInteger(value.version)||value.version<0)throw new Error('Escolha a liderança e confira a versão do local.');
  value.id=locationGroupId(value);
  if(input.source==='address'){value.source='address';value.addressPrecision=input.addressPrecision==='house'?'house':'street';}
  if(value.postalCode&&!/^\d{8}$/.test(value.postalCode))throw new Error('Informe um CEP com 8 dígitos, ou deixe o campo vazio.');
  if(value.cityCode&&!/^\d{1,12}$/.test(value.cityCode))throw new Error('Município inválido.');
  if(features&&value.cityCode&&!features.some(f=>String(f.properties.code)===value.cityCode))throw new Error('Escolha um município do Pará.');
  const hasLat=value.latitude!==null,hasLon=value.longitude!==null;
  if(hasLat!==hasLon)throw new Error('Informe latitude e longitude juntas, ou deixe ambas vazias.');
  if(hasLat&&(!Number.isFinite(value.latitude)||!Number.isFinite(value.longitude)||value.latitude < -10||value.latitude > 3||value.longitude < -59||value.longitude > -45))throw new Error('Coordenadas fora da área de referência do Pará. Confira os sinais e os valores.');
  if(hasLat&&!value.cityCode)throw new Error('Selecione o município do ponto.');
  if(value.accuracy!==null&&(!Number.isFinite(value.accuracy)||value.accuracy<0||value.accuracy>1000000))throw new Error('Precisão da posição inválida.');
  if(value.confirmed&&(!hasLat||!value.reference))throw new Error('Para confirmar, informe o ponto e o nome do local de referência.');
  if(hasLat){value.latitude=+value.latitude.toFixed(6);value.longitude=+value.longitude.toFixed(6);}
  return value;
}
export const needsCepReview=r=>r?.source==='cep'&&r.confirmed!==true&&Number.isFinite(r.latitude)&&Number.isFinite(r.longitude);
export const hasPoint=r=>Number.isFinite(r?.latitude)&&Number.isFinite(r?.longitude)&&!needsCepReview(r);
export function locationPrecision(r){
  if(needsCepReview(r))return {tone:'warning',label:'CEP a revisar',detail:'CEP não confirma a posição da casa.'};
  if(!hasPoint(r))return {tone:'neutral',label:'Sem coordenadas',detail:'Informe o endereço completo ou marque o ponto.'};
  if(r.source==='device'){
    const accuracy=r.accuracy;
    if(!Number.isFinite(accuracy))return {tone:'warning',label:'GPS sem precisão informada',detail:'Confira o ponto no local antes de confirmar.'};
    return {tone:accuracy<=30?'ok':'warning',label:'GPS ±'+Math.round(accuracy)+' m',detail:accuracy<=30?'Precisão estimada pelo aparelho; confira o local.':accuracy<=100?'Área de incerteza moderada. Confira a rua e o número.':'Área de incerteza ampla. Capture novamente no local ou ajuste no mapa.'};
  }
  if(r.source==='address')return {tone:r.addressPrecision==='house'?'neutral':'warning',label:r.addressPrecision==='house'?'Número localizado':'Referência da rua',detail:r.addressPrecision==='house'?'Número encontrado na cartografia; não equivale à confirmação presencial.':'Número não localizado. Ajuste a casa no mapa antes de confirmar.'};
  return {tone:'neutral',label:r.source==='cep'?'Referência de CEP':'Ponto manual',detail:'Conferência manual; precisão em metros não medida.'};
}
function insideRing([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
export function insideGeometry(point,geometry){const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];return polygons.some(p=>insideRing(point,p[0])&&!p.slice(1).some(r=>insideRing(point,r)));}
export const cityAt=(features,longitude,latitude)=>features.find(f=>insideGeometry([longitude,latitude],f.geometry));
export function locationStatus(r,features){
  if(needsCepReview(r))return {status:'approximate',cepReviewRequired:true,message:'Ponto antigo obtido por CEP, sem precisão de rua verificada. Localize o endereço novamente, use o GPS no local ou ajuste no mapa antes de confirmar.'};
  if(!hasPoint(r))return {status:'pending',cepReviewRequired:false,message:r?.cityCode?'Município informado; falta marcar o ponto.':'Cadastre um local de referência.'};
  const city=features?.find(f=>String(f.properties.code)===r.cityCode),outside=city&&!insideGeometry([r.longitude,r.latitude],city.geometry);
  if(outside)return {status:'approximate',cepReviewRequired:false,message:'Ponto fora do contorno aproximado do município. Confira a localização.'};
  return r.confirmed?{status:'confirmed',cepReviewRequired:false,message:'Local de referência confirmado manualmente.'}:{status:'approximate',cepReviewRequired:false,message:'Ponto informado, aguardando confirmação.'};
}
export function leadershipLocations(records,saved=[],drafts=[],features){
  const groups=new Map();for(const r of records.filter(r=>!r.deleted)){const id=locationGroupId(r);if(!groups.has(id))groups.set(id,{id,leadership:r.leadership,coordinator:r.coordinator,recordsCount:0});groups.get(id).recordsCount++;}
  const central=new Map(saved.map(r=>[r.id||locationGroupId(r),r])),local=new Map(drafts.map(r=>[r.id||locationGroupId(r),r]));
  return [...groups.values()].map(g=>{const r=local.get(g.id)||central.get(g.id)||{...g,version:0,latitude:null,longitude:null};return {...r,...g,draft:local.has(g.id),...locationStatus(r,features)};}).sort((a,b)=>a.leadership.localeCompare(b.leadership,'pt-BR')||a.coordinator.localeCompare(b.coordinator,'pt-BR'));
}
export function sameLeadershipLocation(a,b){if(!a||!b)return false;const strip=v=>{const {version,...r}=cleanLeadershipLocation(v);return r;};return JSON.stringify(strip(a))===JSON.stringify(strip(b));}
export function recoverLeadershipLocations(backup,current){const map=new Map(current.map(r=>[r.id||locationGroupId(r),r]));return (backup.leadershipLocations||[]).filter(r=>!sameLeadershipLocation(r,map.get(r.id))).map(r=>({...cleanLeadershipLocation(r),version:map.get(r.id)?.version||0}));}
export const projectPoint=([lon,lat])=>[lon*Math.PI/180,-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];
export const unprojectPoint=([x,y])=>[x*180/Math.PI,(2*Math.atan(Math.exp(-y))-Math.PI/2)*180/Math.PI];
export function geometryRings(geometry){return (geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates).flat();}
export function mapBounds(features){const points=features.flatMap(f=>geometryRings(f.geometry).flat().map(projectPoint));const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];}
// Clustering uses screen distance, independently of electoral performance.
export function clusterLocations(rows,view,width=720,height=480){
  const cells=new Map(),scale=Math.min(width/view[2],height/view[3]),cell=38/scale;
  for(const r of rows.filter(hasPoint)){const [x,y]=projectPoint([r.longitude,r.latitude]);if(x<view[0]||x>view[0]+view[2]||y<view[1]||y>view[1]+view[3])continue;const key=Math.round(x/cell)+':'+Math.round(y/cell);if(!cells.has(key))cells.set(key,{x:0,y:0,rows:[]});const c=cells.get(key);c.x+=x;c.y+=y;c.rows.push(r);}
  return [...cells.values()].map(c=>({...c,x:c.x/c.rows.length,y:c.y/c.rows.length}));
}
