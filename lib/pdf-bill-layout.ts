// Geometry is used only when a complete two-series history can be verified.
export type PdfBillText={str:string;transform:number[]};
export function solarHistoryByPosition(items:PdfBillText[]){
 const months=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
 const labels=items.filter(i=>/^(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\/\d{2}$/i.test(i.str.trim())).sort((a,b)=>b.transform[5]-a.transform[5]);
 if(labels.length<6||labels.length>24||!items.some(i=>/^Injetado$/i.test(i.str.trim())))return '';
 if(labels.some(i=>Math.abs(i.transform[4]-labels[0].transform[4])>3))return '';
 const serial=(s:string)=>{const [m,y]=s.toUpperCase().split('/');return Number(y)*12+months.indexOf(m);};
 if(labels.some((l,i)=>i>0&&serial(l.str.trim())-serial(labels[i-1].str.trim())!==1))return '';
 const numbers=items.filter(i=>/^[\d.]+(?:,\d+)?$/.test(i.str.trim())&&i.transform[4]>labels[0].transform[4]+35&&i.transform[5]<=labels[0].transform[5]+10&&i.transform[5]>=labels.at(-1)!.transform[5]-4);
 const columns:PdfBillText[][]=[];for(const item of numbers){let column=columns.find(c=>Math.abs(c[0].transform[4]-item.transform[4])<3);if(!column){column=[];columns.push(column);}column.push(item);}
 const matches=columns.filter(c=>c.length===labels.length*2).map(c=>c.sort((a,b)=>b.transform[5]-a.transform[5]));if(matches.length!==1)return '';
 const column=matches[0];if(labels.some((l,i)=>Math.abs((column[i*2].transform[5]+column[i*2+1].transform[5])/2-l.transform[5])>10))return '';
 return '\n--- HISTORICO SOLAR POR POSICAO: CONSUMO DA REDE E INJECAO ---\n'+labels.map((l,i)=>`${l.str.trim()}   ${column[i*2].str.trim()}   ${column[i*2+1].str.trim()}`).join('\n');
}
