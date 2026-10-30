import type {MaterialItem} from './materials';
import {calculate,type SolarInput} from './solar.ts';
import {commissionBreakdown,priceForMargin} from './commission.ts';
export type SupplierQuote={materials?:MaterialItem[];systemType?:'on-grid'|'hybrid'|'off-grid';supplier:string;name:string;modules:number;moduleW:number;inverterKw:number;cost:number;freight:number;date:string;note:string;example:boolean;sourceUrl?:string;validUntil?:string;priceType?:'manual'|'public';freightConfirmed?:boolean;history?:{date:string;cost:number;freight:number}[]};
export const SUPPLIER_SOURCES=[
 {name:'Aldo Solar',url:'https://vitrine.aldo.com.br/condicoes-comerciais',note:'Custo de integrador depende da área autenticada e categoria. Importe a cotação recebida; o preço público é sugerido ao consumidor final.'},
 {name:'Bluesun',url:'https://orcamentos.bluesundobrasil.com.br/compra_rapida',note:'Consulte a configuração e a entrega no simulador do distribuidor. Importe o orçamento confirmado para comparar.'},
 {name:'Sollares',url:'https://sollares.com.br/109-gerador-de-energia-solar',note:'Referências públicas de varejo. Pagamento, estoque, frete ao Pará e escopo devem ser confirmados.'},
];
export const PUBLIC_SUPPLIER_PRODUCTS=[
 {id:'sollares-943',url:'https://sollares.com.br/on-grid/943-gerador-de-energia-solar-on-grid-growatt-sem-estrutura.html',name:'Growatt 5 kW · Ronma 620 W · sem estrutura',modules:10,moduleW:620,inverterKw:5},
 {id:'sollares-964',url:'https://sollares.com.br/on-grid/964-gerador-de-energia-solar-on-grid-growatt-telhado-metalico-mini-trilho.html',name:'Growatt 5 kW · Ronma 620 W · telhado metálico',modules:10,moduleW:620,inverterKw:5},
 {id:'sollares-1014',url:'https://sollares.com.br/on-grid/1014-gerador-de-energia-solar-on-grid-growatt-sem-estrutura.html',name:'Growatt 7,5 kW · Ronma 620 W · sem estrutura',modules:10,moduleW:620,inverterKw:7.5},
] as const;
export function publicProductPrice(html:string){
 const candidates:unknown[]=[];
 for(const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{candidates.push(JSON.parse(match[1]));}catch{/* Invalid structured data is never guessed from unrelated prices. */}
 }
 function products(node:unknown):Record<string,any>[] {
  if(Array.isArray(node))return node.flatMap(products);
  if(!node||typeof node!=='object')return [];
  const obj=node as Record<string,any>,type=Array.isArray(obj['@type'])?obj['@type']:[obj['@type']];
  return type.includes('Product')?[obj]:Array.isArray(obj['@graph'])?products(obj['@graph']):[];
 }
 const product=candidates.flatMap(products)[0];if(!product)return null;
 const offers=Array.isArray(product.offers)?product.offers:[product.offers];
 for(const offer of offers){
  if(!offer||offer['@type']==='AggregateOffer'||offer.priceCurrency!=='BRL')continue;
  const raw=offer.price??offer.priceSpecification?.price,price=typeof raw==='number'?raw:Number(raw);
  if(Number.isFinite(price)&&price>0&&price<1e8)return {price,name:String(product.name||''),availability:String(offer.availability||''),condition:'Preço público anunciado em BRL; desconto Pix, frete, impostos adicionais e disponibilidade a confirmar.'};
 }
 return null;
}
export function quoteFreshness(q:SupplierQuote,today:string){
 const date=/^\d{4}-\d{2}-\d{2}$/.test(q.date)?Date.parse(q.date+'T12:00:00Z'):NaN;
 const current=Date.parse(today+'T12:00:00Z'),age=Math.floor((current-date)/86400000);
 const expired=!!q.validUntil&&q.validUntil<today;
 const stale=q.example||!Number.isFinite(age)||age<0||expired||age>(q.priceType==='public'?1:7);
 return {age,expired,stale,label:q.example?'Exemplo ilustrativo':expired?'Cotação vencida':stale?'Atualizar cotação':q.priceType==='public'?'Referência pública · confirmar custo':'Cotação recente · conferir validade'};
}
export function quoteProject(p:SolarInput,q:SupplierQuote):SolarInput {
 return {...p,materials:q.materials??p.materials,systemType:q.systemType??p.systemType,pricing:'kit',kitCost:q.cost,moduleW:q.moduleW,manualModules:q.modules,inverterKw:q.inverterKw,supplier:q.supplier,kitDescription:q.name,freight:q.freight,costsConfirmed:false};
}
export function evaluateQuote(p:SolarInput,q:SupplierQuote){
 const next=quoteProject(p,q),c=calculate(next);
 const localYield=p.hsp.reduce((sum,h,i)=>sum+h*[31,28,31,30,31,30,31,31,30,31,30,31][i],0)*p.pr/100*(1-p.shade/100);
 const required=calculate({...p,manualModules:0}).target;
 return {input:next,...c,targetCoverage:required>0?c.monthlyGeneration/required*100:0,localYield};
}
export function projectCostRisk(p:SolarInput,equipmentIncrease:number){
 const c=calculate(p),newCost=c.cost+c.equipment*equipmentIncrease/100;
 const stressed=commissionBreakdown(c.price,newCost,p.taxes,p.commission,p.commissionBasis);
 return {price:c.price,cost:c.cost,profit:c.profit,margin:c.actualMargin,newCost,stressedProfit:stressed.profit,stressedMargin:stressed.actualMargin,breakEven:priceForMargin(c.cost,0,p.taxes,p.commission,p.commissionBasis)};
}
