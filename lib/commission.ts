export type CommissionBasis='sale'|'profit';
export function commissionBreakdown(price:number,cost:number,taxRate:number,rate:number,basis:CommissionBasis='sale'){
 const saleTaxes=price*taxRate/100,profitBeforeCommission=price-saleTaxes-cost;
 const base=basis==='profit'?Math.max(0,profitBeforeCommission):price;
 const commissionAmount=base*rate/100,profit=profitBeforeCommission-commissionAmount;
 return {saleTaxes,profitBeforeCommission,commissionBase:base,commissionAmount,profit,actualMargin:price?profit/price*100:0};
}
export function priceForMargin(cost:number,margin:number,taxRate:number,rate:number,basis:CommissionBasis='sale'){
 const denominator=basis==='profit'?1-taxRate/100-margin/100/(1-rate/100):1-(margin+taxRate+rate)/100;
 return cost/Math.max(.01,denominator);
}
export function commissionLimit(price:number,cost:number,taxRate:number,minimumMargin:number,basis:CommissionBasis='sale',minimumProfit=0){
 const b=commissionBreakdown(price,cost,taxRate,0,basis),floor=Math.max(minimumProfit,price*minimumMargin/100),budget=Math.max(0,b.profitBeforeCommission-floor);
 return {amount:Math.min(Math.max(0,b.commissionBase),budget),rate:b.commissionBase>0?Math.min(100,budget/b.commissionBase*100):0,possible:b.profitBeforeCommission>=floor,floor};
}
