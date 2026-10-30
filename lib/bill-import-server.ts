import {calculate,type SolarInput} from './solar.ts';
import {profileFromProject,fullDocument,normalizeUnit,type ClientProfile} from './client-project.ts';
type Stored={id:string;owner_id:string;kind:string;payload:string;revision:number;created_at:string;updated_at:string};
type Statement={bind(...values:unknown[]):Statement;first<T=Record<string,unknown>>():Promise<T|null>;all<T=Record<string,unknown>>():Promise<{results:T[]}>};
type BatchResult={meta:{changes?:number}};
export type ImportDB={prepare(sql:string):Statement;batch(statements:Statement[]):Promise<BatchResult[]>};
export class ImportFailure extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status;}}
const expose=(r:Stored)=>({id:r.id,kind:r.kind,data:JSON.parse(r.payload),revision:r.revision,createdAt:r.created_at,updatedAt:r.updated_at});
async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function createClientAndProject(db:ImportDB,owner:string,requestId:string,input:SolarInput){
 const proposalId=`bill_${requestId}`;
 const replay=async()=>{const proposal=await db.prepare('SELECT * FROM solar_records WHERE id=? AND owner_id=? AND kind=?').bind(proposalId,owner,'proposal').first<Stored>();if(!proposal)return null;const clientId=(JSON.parse(proposal.payload) as SolarInput).clientId;const client=await db.prepare('SELECT * FROM solar_records WHERE id=? AND owner_id=? AND kind=?').bind(clientId,owner,'client').first<Stored>();if(!client)throw new ImportFailure('O perfil vinculado não foi encontrado. Recarregue a base.',409);return {proposal:expose(proposal),client:expose(client),reusedClient:true,replayed:true};};
 const prior=await replay();if(prior)return prior;
 if(!input.billReviewed||!input.billFileName||!input.billAnalysis)throw new ImportFailure('Confira a leitura da fatura antes de criar o perfil.');
 const profile=profileFromProject(input);if(!profile.name)throw new ImportFailure('Informe o nome do titular.');
 const document=fullDocument(profile.document),unit=normalizeUnit(input.consumerUnit);
 const matches=await db.prepare("SELECT * FROM solar_records WHERE owner_id=? AND kind='client' AND ((?<>'' AND json_extract(payload,'$.identityDocument')=?) OR (?<>'' AND EXISTS(SELECT 1 FROM json_each(solar_records.payload,'$.consumerUnits') WHERE value=?))) LIMIT 2").bind(owner,document,document,unit,unit).all<Stored>();
 if(matches.results.length>1)throw new ImportFailure('Mais de um perfil corresponde à conta. Revise os cadastros em Clientes antes de importar.',409);
 const existing=matches.results[0];
 if(existing){const old=JSON.parse(existing.payload) as ClientProfile;if(document&&old.identityDocument&&document!==old.identityDocument)throw new ImportFailure('A unidade consumidora já está associada a outro CPF/CNPJ. Revise o perfil antes de importar.',409);}
 const identity=unit?`uc:${unit}`:document?`doc:${document}`:`import:${requestId}`;
 const clientId=existing?.id||`client_${(await digest(`${owner}|${identity}`)).slice(0,40)}`;
 const count=await db.prepare('SELECT COUNT(*) AS count FROM solar_records WHERE owner_id=?').bind(owner).first<{count:number}>();
 if((count?.count||0)+(existing?1:2)>5000)throw new ImportFailure('Limite de registros atingido. Exporte e organize sua base.',400);
 const now=new Date().toISOString(),proposal={...input,clientId,status:'Rascunho'};
 calculate(proposal);
 const statements=[db.prepare('INSERT INTO solar_records (id,owner_id,kind,payload,revision,created_at,updated_at) VALUES (?,?,?,?,1,?,?) ON CONFLICT(id) DO NOTHING').bind(clientId,owner,'client',JSON.stringify(profile),now,now),
  db.prepare("INSERT INTO solar_records (id,owner_id,kind,payload,revision,created_at,updated_at) SELECT ?,?,'proposal',?,1,?,? WHERE EXISTS(SELECT 1 FROM solar_records WHERE id=? AND owner_id=? AND kind='client' AND (?='' OR COALESCE(json_extract(payload,'$.identityDocument'),'') IN ('',?)))").bind(proposalId,owner,JSON.stringify(proposal),now,now,clientId,owner,document,document)];
 try{const result=await db.batch(statements);if(!result[1]?.meta.changes)throw new ImportFailure('Os dados da unidade consumidora precisam de revisão. Nenhum projeto foi criado.',409);}catch(error){const done=await replay();if(done)return done;throw error;}
 const done=await replay();if(!done)throw new ImportFailure('Não foi possível confirmar a gravação. Tente novamente com a mesma importação.',503);
 return {...done,replayed:false,reusedClient:!!existing};
}
