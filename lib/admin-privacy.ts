import {calculate,type SolarInput} from './solar.ts';
export function clientSafeProject(input:SolarInput):SolarInput{
 const p=structuredClone(input),c=calculate(p);
 return {...p,technicalArea:null,technicalFees:null,materials:p.materials?.map(r=>({...r,unitCost:null,includedInBase:true})),manualModules:c.modules,pricing:'kit',kitCost:c.price,moduleCost:0,inverterCost:0,labor:0,structure:0,electrical:0,engineering:0,freight:0,margin:0,taxes:0,commission:0,commissionBasis:'sale',minimumProfit:0,minimumNetMargin:0,discount:0,supplier:'',extras:p.extras.map(e=>({...e,unit:0}))};
}
export const ADMIN_KIND='admin_access';
export function publicRecord(record:{kind:string;data:any;[key:string]:any}){
 if(record.kind===ADMIN_KIND||record.kind==='quote')return null;
 if(record.kind==='proposal')return {...record,data:clientSafeProject(record.data)};
 if(record.kind==='settings')return {...record,data:{...record.data,defaultLabor:0,defaultMargin:0}};
 return record;
}
