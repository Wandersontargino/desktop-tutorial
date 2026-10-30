import {and,eq} from 'drizzle-orm';
import {getDb} from '@/db';
import {records} from '@/db/schema';
import {ADMIN_KIND} from './admin-privacy';
import {tokenHash,equalHashes} from './admin-pin';
import {env} from 'cloudflare:workers';
import {parsePinBootstrap} from './admin-bootstrap';
export const ADMIN_COOKIE='coopsun_admin';
export const ADMIN_SESSION_MS=10*60*1000;
export type AdminGate={salt:string;hash:string;failures:number;lockedUntil:number;sessions:{hash:string;expires:number}[];bootstrapId?:string};
export async function readGate(ownerId:string){
 const [record]=await getDb().select().from(records).where(and(eq(records.ownerId,ownerId),eq(records.kind,ADMIN_KIND))).limit(1);
 return record?{record,gate:JSON.parse(record.payload) as AdminGate}:null;
}
export async function initializeOwnerPin(ownerId:string,email:string){
 const bootstrap=parsePinBootstrap((env as unknown as Record<string,unknown>).COOPSUN_ADMIN_PIN_BOOTSTRAP,email);
 const row=await readGate(ownerId);
 if(!bootstrap||row?.gate.bootstrapId===bootstrap.id)return row;
 const gate:AdminGate={salt:bootstrap.salt,hash:bootstrap.hash,bootstrapId:bootstrap.id,failures:0,lockedUntil:0,sessions:[]};
 if(row){if(!await writeGate(row,gate))throw new Error('Concurrent PIN configuration');}
 else{const now=new Date().toISOString();await getDb().insert(records).values({id:`admin_${ownerId}`,ownerId,kind:ADMIN_KIND,payload:JSON.stringify(gate),revision:1,createdAt:now,updatedAt:now}).onConflictDoNothing();}
 return readGate(ownerId);
}
export function cookieToken(request:Request){return (request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(ADMIN_COOKIE+'='))?.slice(ADMIN_COOKIE.length+1)||'';}
export async function hasAdminAccess(request:Request,ownerId:string){
 const row=await readGate(ownerId),token=cookieToken(request);if(!row||!/^[a-f0-9]{64}$/.test(token))return false;
 const hashed=await tokenHash(token),now=Date.now();return row.gate.sessions.some(s=>s.expires>now&&equalHashes(s.hash,hashed));
}
export async function writeGate(row:NonNullable<Awaited<ReturnType<typeof readGate>>>,gate:AdminGate){
 const updated=await getDb().update(records).set({payload:JSON.stringify(gate),revision:row.record.revision+1,updatedAt:new Date().toISOString()}).where(and(eq(records.id,row.record.id),eq(records.revision,row.record.revision))).returning({id:records.id});
 return updated.length===1;
}
export function sessionCookie(token:string,maxAge:number,request:Request){return `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
