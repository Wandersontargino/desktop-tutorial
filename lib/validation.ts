import {z} from 'zod';
import {MAX_FINANCING_MONTHS} from './financing.ts';
const n=(min=0,max=1e9)=>z.number().finite().min(min).max(max),text=(max=300)=>z.string().max(max);
const billAnalysisSchema=z.object({
 sourceFileName:text(300).optional(),
 hasSolar:z.boolean().default(false),solar:z.object({gridRegime:z.enum(['GD2','GD3']).optional(),gridConsumption:n(0,1e6),injected:n(0,1e6),compensated:n(0,1e6),billedConsumption:n(0,1e6),compensationDebit:n(-1e9,1e9),injectionCredit:n(-1e9,1e9),currentBalance:n(0,1e9).nullable(),expiredCredits:n(0,1e9).nullable(),history:z.array(z.object({period:text(10),gridKwh:n(0,1e6),injectedKwh:n(0,1e6)})).max(60),meterReadings:z.array(z.object({type:text(30),previous:n(),current:n(),factor:n(),kwh:n(0,1e6)})).max(10)}).optional(),
 client:text(),document:text(40),consumerUnit:text(100),accountCode:text(100),reference:text(100),dueDate:text(20).optional(),consumption:n(0,1e6),total:n(),lighting:n(),tariff:n(0,10),fioB:n(0,10),distributor:text(),address:text(800),notes:z.array(text(2000)).max(50),
 phase:n(0,100),group:text(100),classification:text(300),special:z.boolean(),unitTariff:n(0,100),tariffWithoutTaxes:n(0,100),measuredKwh:n(0,1e6),quantityKwh:n(0,1e6),freeKwh:n(0,1e6),
 items:z.array(z.object({label:text(),amount:n(-1e9,1e9),recurring:z.boolean(),category:z.enum(['energy','benefit','flag','fixed','penalty','compensation','injection','other'])})).max(100),taxes:z.array(z.object({name:text(50),base:n(),rate:n(0,100),amount:n()})).max(20),history:z.array(z.object({period:text(10),kwh:n(0,1e6)})).max(60),
 recurringTotal:n(),nonRecurring:n(),netEnergy:n(),effectiveAverage:n(0,100),reconciledTotal:n(-1e9,1e9),reconciliationDifference:n(-1e9,1e9),readingDays:n(0,365),previousReading:text(100),currentReading:text(100),
});
const fiscalTax=z.object({rate:n(0,99).nullable(),incidence:z.object({energy:z.boolean().nullable(),fioB:z.boolean().nullable(),minimum:z.boolean().nullable(),flag:z.boolean().nullable(),other:z.boolean().nullable()})});
export const fiscalSchema=z.object({taxes:z.object({ICMS:fiscalTax,PIS:fiscalTax,COFINS:fiscalTax}),excludeIcmsFromFederal:z.boolean(),source:text(1500),confirmed:z.boolean(),te:n(0,10).nullable(),tusd:n(0,10).nullable()});
export const inputSchema=z.object({
 inverterReadings:z.array(z.object({reference:text(100),start:text(20),end:text(20),generationKwh:n(0,1e7),source:text(1500),confirmed:z.boolean()})).max(60).optional(),
 selfUseBasis:z.object({kind:z.enum(['assumption','inverter']),percent:n(0,100),source:text(1500),reference:text(100),confirmed:z.boolean()}).nullable().optional(),
 billingAdjustment:z.object({factor:n(.5,1.5),reference:text(100),source:text(1500),confirmed:z.boolean()}).nullable().optional(),
 referenceBasis:z.enum(['last','average','peak']).optional(),
 sizingBasis:z.enum(['last','average','peak','manual']).optional(),
 systemType:z.enum(['on-grid','hybrid','off-grid']).optional(),
 materials:z.array(z.object({id:text(100),description:text(300),specification:text(1500),quantity:n(0,1e6),unit:text(40),unitCost:n().nullable(),includedInBase:z.boolean()})).max(100).nullable().optional(),
 technicalFees:z.array(z.object({id:text(100),name:text(300),amount:n().nullable(),includedInEngineering:z.boolean(),source:text(1500),confirmed:z.boolean()})).max(30).nullable().optional(),
 proposalCover:z.enum(['illustration','solar-photo','portfolio']).optional(),
 consumptionScenario:z.enum(['current','project','manual']).optional(),futureConsumption:n(1,1e6).nullable().optional(),
 technicalArea:z.object({lengthM:n(.1,5).nullable(),widthM:n(.1,5).nullable(),allowancePct:n(0,200),availableM2:n(0,1e7).nullable(),source:text(1500)}).nullable().optional(),
 proposalDetails:z.object({moduleBrand:text(300),inverterBrand:text(300),moduleWarranty:text(500),inverterWarranty:text(500),installationWarranty:text(500),performanceWarranty:text(500),delivery:text(1000),exclusions:text(3000),support:text(1000),paymentTerms:text(1500)}).nullable().optional(),
 analysisView:z.enum(['documents','projection']).optional(),
 generationSuggestion:z.object({baseMonthlyKwh:n(1,1e7),reservePct:n(-100,1e9).gt(-100),monthlyKwh:n(1,1e7),source:text(1500)}).nullable().optional(),
 referenceMode:z.boolean().default(false),systemReference:z.object({modules:n(1,100000).int(),moduleW:n(100,1000),inverterKw:n(.1,10000),monthlyKwh:n(1,1e7),investment:n(1),source:text(1500),paymentTerms:text(1000)}).nullable().default(null),
 startMonth:n(0,11).int().default(0),
 solarComparison:z.object({bill:billAnalysisSchema,fileName:text(300)}).nullable().default(null),
 compensationTax:z.object({perKwh:n(0,10),source:text(1500),reference:text(100),confirmed:z.boolean()}).nullable().default(null),
 fioBReference:z.object({agent:text(100),group:text(10),social:z.boolean(),at:text(10),start:text(10),end:text(10),resolution:text(300),net:n(0,10),source:text(1500),generatedAt:text(40),checkedAt:text(40),retrieval:z.enum(['live','snapshot']).optional(),capturedAt:text(10).optional(),taxFactor:n(1,3),taxBillReference:text(100)}).nullable().default(null),
 comparisonBasis:z.enum(['invoice','annual']).default('invoice'),fiscal:fiscalSchema.nullable().default(null),recurringCharges:z.array(z.object({id:text(100),label:text(),amount:n(),kind:z.enum(['flag','other'])})).max(50).nullable().default(null),
 client:text(),phone:text(40),email:text(),document:text(40),city:text(),address:text(800),clientId:text(100).default(''),
 loads:z.array(z.object({id:text(100),name:text(),quantity:n(0,100000),watts:n(0,1e7),hours:n(0,24),days:n(0,31),duty:n(0,100)})).max(200),useLoadConsumption:z.boolean(),
 reservePct:n(-100,1e9).gt(-100),autoTarget:z.boolean(),criticalMonth:z.boolean(),billReference:text(100),consumerUnit:text(100),billTotal:n(),billConsumption:n(0,1e6),billText:text(45000),billFileName:text(300),billReviewed:z.boolean(),
 billAnalysis:billAnalysisSchema.nullable(),
 billAnalyses:z.array(billAnalysisSchema).max(12).default([]),projectMode:z.enum(['new','expansion']).default('new'),isSimulation:z.boolean().default(false),existingSystemKwp:n(0,100000).default(0),existingGenerationMonthly:n(0,1e7).default(0),
 consumption:n(1,1e6),target:n(1,1e6),monthlyConsumption:z.array(n(0,1e6)).length(12),detailedConsumption:z.boolean(),
 hsp:z.array(n(0.1,9)).length(12),pr:n(10,100),shade:n(0,90),moduleW:n(100,1000),moduleArea:n(0.1,10),manualModules:n(0,100000).int(),inverterKw:n(0.1,10000),phase:z.union([z.literal(30),z.literal(50),z.literal(100)]),selfUse:n(0,100),
 tariffName:text(),tariff:n(0.01,10),fioB:n(0,10),tariffConfirmed:z.boolean(),tariffSource:text(1500),tariffValidUntil:text(10),lighting:n(),otherFixed:n(),startYear:n(2023,2100).int(),regime:z.enum(['transition','legacy']),post2028:n(0,200),
 pricing:z.enum(['components','kit']),moduleCost:n(),inverterCost:n(),kitCost:n(),supplier:text(),kitDescription:text(1000),costsConfirmed:z.boolean(),labor:n(),structure:n(),electrical:n(),engineering:n(),freight:n(),
 extras:z.array(z.object({id:text(100),name:text(),quantity:n(0,1e6),unit:n()})).max(100),margin:n(0,90),taxes:n(0,50),commission:n(0,50),commissionBasis:z.enum(['sale','profit']).optional(),minimumProfit:n().optional(),minimumNetMargin:n(0,90).optional(),discount:n(0,90),downPayment:n(),months:n(1,MAX_FINANCING_MONTHS).int(),interest:n(0,20),financeFees:n(),
 inflation:n(0,30),degradation:n(0,10),maintenance:n(0,20),discountRate:n(0,50),replacementYear:n(0,25).int(),replacementCost:n(),validity:n(1,365).int(),notes:text(6000),scope:text(6000),status:z.enum(['Rascunho','Enviada','Negociação','Aprovada','Perdida','Arquivada']),hspConfirmed:z.boolean(),
}).superRefine((p,c)=>{
 if(p.selfUseBasis?.confirmed&&(!p.selfUseBasis.source.trim()||Math.abs(p.selfUseBasis.percent-p.selfUse)>.000001))c.addIssue({code:'custom',message:'Confira a fonte e o percentual de uso direto do cenário.',path:['selfUseBasis']});
 if(p.billingAdjustment?.confirmed&&!p.billingAdjustment.source.trim())c.addIssue({code:'custom',message:'Informe a fonte do ajuste entre medição e faturamento.',path:['billingAdjustment']});
 if(p.autoTarget&&(p.reservePct<0||p.reservePct>100))c.addIssue({code:'custom',message:'A reserva automática deve ficar entre 0% e 100%; use uma meta manual para outros percentuais.',path:['reservePct']});
 if((p.technicalFees??[]).filter(f=>f.includedInEngineering).reduce((sum,f)=>sum+(f.amount??0),0)>p.engineering+.005)c.addIssue({code:'custom',message:'As parcelas incluídas em engenharia superam o custo de engenharia informado.',path:['engineering']});
 if(p.consumptionScenario==='manual'&&!p.futureConsumption)c.addIssue({code:'custom',message:'Informe o consumo futuro do cenário.',path:['futureConsumption']});
 if(p.technicalArea&&((p.technicalArea.lengthM===null)!==(p.technicalArea.widthM===null)))c.addIssue({code:'custom',message:'Informe comprimento e largura do módulo, ou deixe ambos vazios para usar a área unitária de referência.',path:['technicalArea']});
 if(p.referenceMode&&(!p.systemReference||!p.systemReference.source.trim()))c.addIssue({code:'custom',message:'Informe o documento do sistema de referência.',path:['systemReference']});
 if(p.compensationTax?.confirmed&&!p.compensationTax.source.trim())c.addIssue({code:'custom',message:'Informe a fonte do encargo SCEE confirmado.',path:['compensationTax','source']});
 if(p.fiscal){const f=p.fiscal;if(f.taxes.ICMS.rate!==null&&f.taxes.PIS.rate!==null&&f.taxes.COFINS.rate!==null&&f.taxes.ICMS.rate+f.taxes.PIS.rate+f.taxes.COFINS.rate>=100)c.addIssue({code:'custom',message:'Confira as alíquotas: a soma deve ser inferior a 100%.',path:['fiscal','taxes']});}
 if(p.margin+p.taxes+p.commission>=95)c.addIssue({code:'custom',message:'Margem, tributos e comissão devem somar menos de 95%.',path:['margin']});
 if(p.commissionBasis==='profit'&&1-p.taxes/100-p.margin/100/(1-p.commission/100)<=.01)c.addIssue({code:'custom',message:'A margem desejada é incompatível com os tributos e a comissão sobre o lucro.',path:['commission']});
 if(p.fioB>p.tariff)c.addIssue({code:'custom',message:'O Fio B não pode superar a tarifa efetiva.',path:['fioB']});
 if(p.detailedConsumption&&p.monthlyConsumption.every(v=>v===0))c.addIssue({code:'custom',message:'Informe o consumo de pelo menos um mês.',path:['monthlyConsumption']});
 if(p.useLoadConsumption&&!p.loads.some(l=>l.quantity*l.watts*l.hours*l.days*l.duty>0))c.addIssue({code:'custom',message:'Adicione equipamentos com consumo antes de usar a estimativa.',path:['loads']});
});
export const settingsSchema=z.object({company:text(),tagline:text(),cnpj:text(40),phone:text(40),email:text(),website:text(),address:text(800),representative:text(),defaultLabor:n(),defaultMargin:n(0,80)});
export const tariffSchema=z.object({name:text(),state:text(20),group:text(80),tariff:n(0.01,10),fioB:n(0,10),source:text(1500),start:text(10),end:text(10),confirmed:z.boolean(),note:text(2000)});
export const quoteSchema=z.object({systemType:z.enum(['on-grid','hybrid','off-grid']).optional(),materials:z.array(z.object({id:text(100),description:text(300),specification:text(1500),quantity:n(0,1e6),unit:text(40),unitCost:n().nullable(),includedInBase:z.boolean()})).max(100).optional(),supplier:text(),name:text(),modules:n(1,100000).int(),moduleW:n(100,1000),inverterKw:n(0.1,10000),cost:n(1),freight:n(),date:text(10),note:text(2000),example:z.boolean(),
 sourceUrl:z.union([z.literal(''),z.string().max(1500).url().refine(v=>new URL(v).protocol==='https:','Use uma fonte HTTPS.')]).optional(),validUntil:text(10).optional(),priceType:z.enum(['manual','public']).optional(),freightConfirmed:z.boolean().optional(),history:z.array(z.object({date:text(10),cost:n(1),freight:n()})).max(60).optional(),
});
export const clientSchema=z.object({name:text().min(1),document:text(40),identityDocument:text(14),phone:text(40),email:text(),city:text(),address:text(800),consumerUnits:z.array(text(100)).max(50),distributor:text(),classification:text(),lastBillReference:text(100),lastBillTotal:n(),recurringBillTotal:n(),lastConsumption:n(0,1e6),averageConsumption:n(0,1e6),peakConsumption:n(0,1e6),sourceFileName:text(300),source:z.enum(['bill','manual'])});
export const recordSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),kind:z.enum(['proposal','settings','tariff','quote','client']),revision:n(0,1e9).int(),data:z.unknown()});
export const billImportSchema=z.object({requestId:z.string().uuid(),proposal:inputSchema});
