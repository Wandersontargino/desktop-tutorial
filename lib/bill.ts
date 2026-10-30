export type BillItem={label:string;amount:number;recurring:boolean;category:'energy'|'benefit'|'flag'|'fixed'|'penalty'|'compensation'|'injection'|'other'};
export type BillTax={name:string;base:number;rate:number;amount:number};
export type BillHistory={period:string;kwh:number};
export type SolarBillDetail={gridRegime?:'GD2'|'GD3';gridConsumption:number;injected:number;compensated:number;billedConsumption:number;compensationDebit:number;injectionCredit:number;currentBalance:number|null;expiredCredits:number|null;history:{period:string;gridKwh:number;injectedKwh:number}[];meterReadings:{type:string;previous:number;current:number;factor:number;kwh:number}[]};
export type BillReading={
 sourceFileName?:string;
 hasSolar?:boolean;solar?:SolarBillDetail;client:string;document:string;consumerUnit:string;accountCode:string;reference:string;dueDate?:string;consumption:number;total:number;lighting:number;tariff:number;fioB:number;distributor:string;address:string;notes:string[];
 phase:number;group:string;classification:string;special:boolean;unitTariff:number;tariffWithoutTaxes:number;
 measuredKwh:number;quantityKwh:number;freeKwh:number;items:BillItem[];taxes:BillTax[];history:BillHistory[];
 recurringTotal:number;nonRecurring:number;netEnergy:number;effectiveAverage:number;reconciledTotal:number;reconciliationDifference:number;readingDays:number;previousReading:string;currentReading:string;
};
export function brNumber(raw:string){const s=raw.trim().replace(/\s|R\$/g,'');return Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):/^[-+]?\d{1,3}(?:\.\d{3})+$/.test(s)?s.replace(/\./g,''):s);}
export function parseBill(raw:string,sourceName=''):BillReading{
 const text=raw.replace(/\r/g,'').replace(/\u00a0/g,' '),fold=text.normalize('NFD').replace(/[\u0300-\u036f]/g,''),lines=text.split('\n');
 const number='([-+]?[\\d.]+(?:,\\d+)?)',read=(pattern:string)=>{const m=fold.match(new RegExp(pattern,'i'));return m?brNumber(m[1]):0;};
 const moneyNumbers=(s:string)=>[...s.matchAll(/[-+]?\d[\d.]*(?:,\d+)?/g)].map(m=>brNumber(m[0]));
 const rowValues=(label:RegExp)=>{const line=fold.split('\n').find(l=>label.test(l));if(!line)return [];const cleaned=line.replace(label,'').split(/\s{2,}(?:ICMS|PIS|COFINS|[A-Z]{3}\/\d{2})\b|\s{2,}[CONSUMOkWh](?:\s{2,}|$)/)[0];return moneyNumbers(cleaned);};
 const consumptionRows=fold.split('\n').filter(l=>/^\s*Consumo\s*\(kWh\)/i.test(l)).map(l=>moneyNumbers(l.replace(/^\s*Consumo\s*\(kWh\)/i,'').split(/\s{2,}(?:ICMS|PIS|COFINS)\b/)[0])).filter(v=>v.length>=3);
 const measuredMatches=[...fold.matchAll(/([\d.]+(?:,\d+)?)\s*kWh\b/gi)].map(m=>brNumber(m[1])).filter(v=>v>0&&v<1e6);
 const hasSolar=/Consumo Compensado|Energia Ativa Injetada|Energia Injetada/i.test(fold);
 const compensationRow=rowValues(/^\s*Consumo Compensado\s*\(kWh\)/i),injectionRow=rowValues(/^\s*Energia Ativa Injetada\s*\(kWh\)/i);
 const compensated=compensationRow[0]||0,injected=injectionRow[0]||0;
 const meterReadings:SolarBillDetail['meterReadings']=[];
 for(const line of fold.split('\n')){const m=line.match(/^\s*\d+\s+(Consumo|Energia Injetada)\s+ATIVO TOTAL\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*kWh/i);if(m)meterReadings.push({type:/Injetada/i.test(m[1])?'injection':'grid',previous:brNumber(m[2]),current:brNumber(m[3]),factor:brNumber(m[4]),kwh:brNumber(m[5])});}
 const gridMeter=meterReadings.find(r=>r.type==='grid')?.kwh;
 const measuredKwh=gridMeter??(hasSolar?consumptionRows.reduce((sum,r)=>sum+r[0],0)+compensated:measuredMatches.length?measuredMatches[measuredMatches.length-1]:0);
 const quantityKwh=consumptionRows.reduce((s,r)=>s+r[0],0)+(hasSolar?compensated:0),freeKwh=consumptionRows.filter(r=>r[1]===0).reduce((s,r)=>s+r[0],0);
 const consumption=measuredKwh||read('consumo(?:\\s+(?:ativo|faturado|mensal|total|de energia))?(?:\\s*\\(kwh\\))?[ \\t:=-]*'+number+'[ \\t]*(?:kwh)')||quantityKwh;
 const dueBlock=fold.match(/\b(\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+R\$\s*([\d.,]+)/);
 const labelledTotal=fold.match(/(?:total a pagar|valor a pagar|valor total da fatura|total da fatura)[^\n\d]{0,30}(\d[\d.]*,\d{2})(?!\d)/i);
 const total=dueBlock?brNumber(dueBlock[3]):labelledTotal?brNumber(labelledTotal[1]):0;
 const lighting=read('(?:^|\\n)[ \\t]*(?:iluminacao publica|contribuicao ilum[^\\n:]{0,20}|cip(?:-ilum pub pref munic)?|cosip)\\b[^\\n\\d]{0,500}'+number);
 const regularTariff=read('(?:tarifa efetiva|tarifa unitaria|valor unitario)[^\\n\\d]{0,20}'+number);
 const pricedRow=consumptionRows.find(r=>r[0]>0&&r[1]>0),unitTariff=pricedRow?.[1]||regularTariff,tariffWithoutTaxes=pricedRow?.[2]||0;
 const fioB=read('(?:tarifa fio b|componente fio b|fio b unitario)[^\\n\\d]{0,20}'+number);
 let client=(text.match(/(?:nome do cliente|titular|cliente|nome\/razao social)\s*[:\-]\s*([^\n]{3,150})/i)?.[1]||'').trim();
 if(/C\.C|Unidade de Leitura|Compet.ncia/i.test(client))client='';
 const cpfLine=lines.findIndex(l=>/\bCPF\s*:/i.test(l));
 if(!client&&cpfLine>0){const candidates=lines.slice(Math.max(0,cpfLine-5),cpfLine).map(l=>l.trim().split(/\s{2,}/)[0].split(/\bLeituras?\b/i)[0].trim()).reverse();client=candidates.find(l=>/^[A-ZÀ-Ÿa-zà-ÿ][A-ZÀ-Ÿa-zà-ÿ .'-]+$/.test(l)&&l.split(/\s+/).length>=2&&!/CLASSIFICACAO|INSTALACAO|CONTA CONTRATO|FORNECIMENTO|RESIDENCIAL|LEITURA|DATA DAS|DANF3E|TARIFARIA/i.test(l.normalize('NFD').replace(/[\u0300-\u036f]/g,'')))||'';}
 const clientRegion=client&&text.includes(client)?text.slice(text.indexOf(client),text.indexOf(client)+1000):text;
 const document=(clientRegion.match(/(?:CPF|CNPJ)(?:\s*\/\s*CNPJ)?\s*[:\-]?\s*([\d.*Xx/\-]{11,20})/i)?.[1]||text.match(/CPF(?:\s*\/\s*CNPJ)?\s*[:\-]?\s*([\d.*Xx/\-]{11,20})/i)?.[1]||'').trim();
 const header=fold.split(/INFORMACOES PARA O CLIENTE|MENSAGENS IMPORTANTES|ITENS (?:DA |DE )?FATURA|Periodos:/i)[0].split('\n').filter(l=>!/(?:CPF|CNPJ)\s*:/i.test(l)).join('\n');
 const consumerUnit=(fold.match(/(?:unidade consumidora|numero da uc|\bUC\b|instalacao|codigo do cliente)[ \t:=-]*([\d.\-]{5,30})/i)?.[1]||header.match(/\b\d{1,3}\.\d{3}\.\d{3}\.\d{3}-\d{2}\b/)?.[0]||header.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)?.[0]||'').trim();
 const footerIndex=lines.findIndex(l=>/Nome do Cliente.*C\.C/.test(l)),footer=footerIndex>=0?lines.slice(footerIndex+1).find(l=>l.trim())?.trim().split(/\s{2,}/):undefined;
 const contractIndex=lines.findIndex(l=>/Conta Contrato/i.test(l));
 const nearContract=contractIndex<0?'':lines.slice(contractIndex+1,contractIndex+4).find(l=>/^\s*\d{5,20}\s*$/.test(l))?.trim()||'';
 const accountCode=footer?.[1]||fold.match(/(?:CODIGO PARA DEBITO AUTOMATICO|CONTA CONTRATO)[ \t:]+(\d{5,20})/i)?.[1]||nearContract;
 const reference=(fold.match(/(?:referencia|competencia|mes\/ano)[ \t:=-]*([A-Za-z]{3,9}[\s/.-]+\d{4}|\d{2}[/-]\d{4})/i)?.[1]||dueBlock?.[1]||footer?.find(v=>/^\d{2}\/\d{4}$/.test(v))||'').trim();
 let address=(text.match(/(?:endere[cç]o(?: da instala[cç][aã]o)?)[ \t:=-]*([^\n]{6,250})/i)?.[1]||'').trim();
 if(!address&&cpfLine>=0){const next=lines.slice(cpfLine+1,cpfLine+8).map(l=>l.trim().split(/\s{2,}/)[0]).filter(l=>l&&!/PERDAS|NOTA FISCAL|DATA DE EMISSAO|CONTA CONTRATO|CHAVE DE ACESSO|^\d{5,}$|^https?:/i.test(l.normalize('NFD').replace(/[\u0300-\u036f]/g,'')));address=next.join(' · ');}
 const distributorFromName=!/equatorial|energisa|cemig|enel/i.test(fold)&&/equatorial/i.test(sourceName);
 const distributor=/equatorial/i.test(fold)||distributorFromName?(/para\b|-\s*PA\b/i.test(fold)?'Equatorial Pará':'Equatorial Energia'):/energisa/i.test(fold)?'Energisa':/cemig/i.test(fold)?'Cemig':/enel/i.test(fold)?'Enel':'';
 const special=/BAIXA\s*RENDA|BAIXARENDA|TARIFA SOCIAL/i.test(fold),phase=/BIFASICO/i.test(fold)?50:/TRIFASICO/i.test(fold)?100:/MONOFASICO/i.test(fold)?30:0;
 const classification=special?'Residencial baixa renda':(fold.match(/CLASSIFICACAO:\s*([^\n]+)/i)?.[1]||'Não identificada').split(/\s{2,}/)[0].trim();
 const group=fold.match(/SUBGRUPO:\s*([AB]\d[\w]*)/i)?.[1]||'';
 const items:BillItem[]=[];
 const add=(label:string,amount:number,category:BillItem['category'],recurring=true)=>{if(Number.isFinite(amount)&&amount!==0)items.push({label,amount,category,recurring});};
 for(const r of consumptionRows)add(`Consumo tarifado · ${r[0]} kWh`,r[5]??0,'energy');
 if(hasSolar){add('Consumo compensado · contrapartida da energia',compensationRow[5]||0,'compensation');add('Energia ativa injetada · crédito na fatura',injectionRow[5]||0,'injection');}
 for(const line of fold.split('\n')){const label=/^\s*Energia\s+Inj\.[^\n]*?\(kWh\)/i;if(!label.test(line))continue;const values=moneyNumbers(line.replace(label,'').split(/\s{2,}(?:ICMS|PIS|COFINS)\b/)[0]);if(values.length>=6)add('Créditos anteriores de energia utilizados',values[5],'injection');}
 const gridCharges=rowValues(/^\s*(?:Parc\.?\s*Inj\.?\s*S\s*\/\s*Desc\.?\s*-?\s*GD\s*[23]|Fio\s*B\s*\(kWh\))/i);if(gridCharges.length>=2)add('Uso da rede / Fio B · lançamento explícito',gridCharges.at(-1)??0,'other');
 const benefitGross=rowValues(/^\s*Beneficio (?:Tarifario|Tributario) Bruto(?: SCEE)?/i);if(benefitGross.length)add('Benefício tarifário bruto',benefitGross[2]??benefitGross.at(-1)??0,'benefit');
 const flag=rowValues(/^\s*Adicional Bandeira/i);if(flag.length)add('Adicional de bandeira',flag[2]??flag.at(-1)??0,'flag');
 const benefitNet=read('Beneficio (?:Tarifario|Tributario) Liquido(?: SCEE)?[^\\n\\d-]{0,500}'+number);if(benefitNet)add('Benefício tarifário líquido',benefitNet,'benefit');
 add('Iluminação pública / CIP',lighting,'fixed');
 const fine=read('(?:^|\\n)[ \\t]*Multa[^\\n\\d]{0,500}'+number),interest=read('(?:^|\\n)[ \\t]*Juros[^\\n\\d]{0,500}'+number);
 add('Multa',fine,'penalty',false);add('Juros',interest,'penalty',false);
 for(const [pattern,label,recurring] of [[/^\s*Correcao Monetaria/i,'Correção monetária',false],[/^\s*Parcelamento(?: de debitos)?/i,'Parcelamento de débitos',false],[/^\s*Doacao/i,'Doação',true],[/^\s*Seguro/i,'Seguro / serviço agregado',true],[/^\s*Custo de Disponibilidade/i,'Custo de disponibilidade',true]] as const){const values=rowValues(pattern);if(values.length)add(label,values.at(-1)??0,'other',recurring);}
 const taxes:BillTax[]=[];for(const name of ['ICMS','PIS','COFINS']){const m=fold.match(new RegExp('\\b'+name+'[ \\t]+'+number+'[ \\t]+'+number+'[ \\t]+'+number));if(m)taxes.push({name,base:brNumber(m[1]),rate:brNumber(m[2]),amount:brNumber(m[3])});}
 const months=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
 const historyMap=new Map<string,BillHistory>();for(const m of fold.matchAll(/\b(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\/(\d{2}|\d{4})[ \t]+([\d.,]+)/gi)){const year=m[2].length===2?'20'+m[2]:m[2],month=months.indexOf(m[1].toUpperCase())+1,kwh=brNumber(m[3]),period=`${year}-${String(month).padStart(2,'0')}`;if(kwh<1e6)historyMap.set(period,{period,kwh});}
 const solarHistory:SolarBillDetail['history']=[];
 if(hasSolar){
  historyMap.clear();const historyLines=fold.split('\n');
  const adjacent=(i:number)=>{const value=historyLines[i]?.trim().replace(/^[CONSUMOkWh]\s+/, '');if(!value||/\b(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\//i.test(value))return null;if(/^[\d.,]+$/.test(value))return brNumber(value);const trailing=value.match(/\s{2,}(\d{1,6})$/);return trailing?brNumber(trailing[1]):null;};
  for(let i=0;i<historyLines.length;i++){
   const m=historyLines[i].match(/\b(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\/(\d{2}|\d{4})(?:[ \t]+([\d.,]+))?(?:[ \t]+([\d.,]+))?/i);if(!m)continue;
   let prev=adjacent(i-1);if(prev===null&&i>1&&!/\b(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\//i.test(historyLines[i-1]))prev=adjacent(i-2);
   const next=adjacent(i+1),next2=adjacent(i+2);let gridKwh:number|null=null,injectedKwh:number|null=null;
   if(m[4]){gridKwh=brNumber(m[3]);injectedKwh=brNumber(m[4]);}
   else if(m[3]){if(prev!==null){gridKwh=prev;injectedKwh=brNumber(m[3]);}else if(next!==null){gridKwh=brNumber(m[3]);injectedKwh=next;}}
   else if(prev!==null&&next!==null){gridKwh=prev;injectedKwh=next;}else if(next!==null&&next2!==null){gridKwh=next;injectedKwh=next2;}
   const period=`${m[2].length===2?'20'+m[2]:m[2]}-${String(months.indexOf(m[1].toUpperCase())+1).padStart(2,'0')}`;
   if(gridKwh!==null&&injectedKwh!==null&&gridKwh>=0&&injectedKwh>=0){solarHistory.push({period,gridKwh,injectedKwh});historyMap.set(period,{period,kwh:gridKwh});}
  }
 }

 const history=Array.from(historyMap.values()).sort((a,b)=>a.period.localeCompare(b.period));
 const nonRecurring=items.filter(i=>!i.recurring).reduce((s,i)=>s+i.amount,0),recurringTotal=Math.max(0,total-nonRecurring),netEnergy=Math.max(0,recurringTotal-lighting),effectiveAverage=consumption?netEnergy/consumption:0,reconciledTotal=items.reduce((s,i)=>s+i.amount,0),reconciliationDifference=total-reconciledTotal;
 const tariff=special&&effectiveAverage>0?effectiveAverage:regularTariff||unitTariff;
 const reading=fold.match(/(\d{2}\/\d{2}\/\d{4})[ \t]+(\d{2}\/\d{2}\/\d{4})[ \t]+(\d{1,2})[ \t]+(\d{2}\/\d{2}\/\d{4})/);
 const notes=['Leitura automática sujeita a erros: confira cada campo na fatura antes de aplicar.'];
 const filePeriod=sourceName.match(/\b(0[1-9]|1[0-2])[ _/-]+(20\d{2})\b/);
 if(filePeriod&&reference&&`${filePeriod[1]}/${filePeriod[2]}`!==reference)notes.push(`O nome do arquivo indica ${filePeriod[1]}/${filePeriod[2]}, mas a competência impressa é ${reference}. A análise usa a competência impressa.`);
 if(!consumption)notes.push('Consumo não identificado com segurança. Informe o consumo faturado em kWh.');
 if(!tariff)notes.push('Tarifa não identificada. Não divida o total da fatura por kWh sem retirar CIP e demais itens.');
 if(!fioB)notes.push(hasSolar?'A componente Fio B não aparece em linha própria. A compensação e os créditos desta conta podem ser conciliados; isso não identifica sozinho o Fio B ou o regime da ampliação. Consulte a tabela oficial da concessionária.':'Nesta conta sem solar, o uso da distribuição já integra a tarifa integral. A componente Fio B para o projeto futuro deve ser obtida na tabela oficial da concessionária, sem confundi-la com a TUSD total.');
 if(distributorFromName)notes.push('Concessionária identificada pelo nome do arquivo e pela UF do endereço: confira no cabeçalho do PDF.');
 if(special)notes.push('Tarifa Social identificada. A projeção linear pela tarifa média líquida é preliminar e não recalcula a faixa gratuita ou o benefício após a instalação solar. Valide o tratamento especial antes de concluir a proposta.');
 if(nonRecurring)notes.push('Multa e juros foram separados: são cobranças eventuais e não devem ser repetidos na projeção de economia.');
 if(measuredKwh&&quantityKwh&&Math.abs(measuredKwh-quantityKwh)>.05)notes.push(`Consumo medido (${measuredKwh} kWh) difere da soma das faixas (${quantityKwh.toFixed(2)} kWh). Confira a diferença; o medido foi usado como base.`);
 if(items.length&&Math.abs(reconciliationDifference)>.02)notes.push('A soma dos itens identificados difere do total da fatura. Confira itens ainda não identificados.');
 if(history.length>=12&&!hasSolar)notes.push('Histórico de 12 meses disponível. A média anual é mais representativa para dimensionar do que usar somente a última conta.');
 const nullableEnergy=(label:string)=>{const m=fold.match(new RegExp(label.replace(/ /g,'\\s+')+'[^\\n\\d]{0,80}'+number+'[ \\t]*kWh','i'));return m?brNumber(m[1]):null;};
 const accumulated=fold.match(new RegExp('Saldo Acumulado Geral Total:[ \\t]*'+number,'i'));
 const solar:SolarBillDetail|undefined=hasSolar?{gridConsumption:measuredKwh,injected:meterReadings.find(r=>r.type==='injection')?.kwh??injected,compensated,billedConsumption:consumptionRows.reduce((sum,r)=>sum+r[0],0),compensationDebit:compensationRow[5]||0,injectionCredit:items.filter(i=>i.category==='injection').reduce((sum,i)=>sum+i.amount,0),currentBalance:nullableEnergy('saldo de creditos(?: disponivel| acumulado| atual)?[ \\t]*:')??(accumulated?brNumber(accumulated[1]):null),expiredCredits:nullableEnergy('saldo de creditos expirados[^:]{0,100}:'),history:Array.from(new Map(solarHistory.map(h=>[h.period,h])).values()).sort((a,b)=>a.period.localeCompare(b.period)),meterReadings}:undefined;
 if(solar){const observed=fold.match(/Parc\.?\s*Inj\.?\s*S\s*\/\s*Desc\.?\s*-?\s*GD\s*([23])/i);if(observed)solar.gridRegime=observed[1]==='2'?'GD2':'GD3';}
 if(hasSolar)notes.push('Esta conta já tem compensação solar. Consumo da rede não é consumo total do imóvel; energia injetada não é geração total. Autoconsumo e geração exigem dados do inversor.');
 if(hasSolar)notes.push('Consumo compensado e crédito da injeção são lançamentos distintos e não devem ser somados como duas economias. Saldo de créditos atual só é preenchido quando aparece explicitamente.');
 return {sourceFileName:sourceName,hasSolar,solar,client,document,consumerUnit,accountCode,reference,dueDate:dueBlock?.[2]||'',consumption:consumption<=1e6?consumption:0,total,lighting,tariff:tariff<=10?tariff:0,fioB:fioB<=10?fioB:0,distributor,address,notes,phase,group,classification,special,unitTariff,tariffWithoutTaxes,measuredKwh,quantityKwh,freeKwh,items,taxes,history,recurringTotal,nonRecurring,netEnergy,effectiveAverage,reconciledTotal,reconciliationDifference,readingDays:reading?Number(reading[3]):0,previousReading:reading?.[1]||'',currentReading:reading?.[2]||''};
}
