export const FINANCING_TERMS=[12,24,36,48,60,72,84] as const;
export const MAX_FINANCING_MONTHS=84;
const money=(v:number)=>Math.round((v+Number.EPSILON)*100)/100;
export function calculateFinancing(price:number,downPayment:number,months:number,interest:number,financeFees:number){
 const down=Math.min(price,Math.max(0,downPayment)),principal=Math.max(0,price-down)+financeFees,rate=interest/100;
 const raw=principal===0?0:rate===0?principal/months:principal*rate/(1-(1+rate)**(-months));
 const installment=money(raw),totalFinanced=money(down+installment*months);
 return {down,principal,installment,totalFinanced};
}
