import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {cleanRecord} from '../../lib/crm-model.mjs';
export const fixtureLocations={'72|372':[{cityCode:'4154',city:'ANANINDEUA',place:'ESCOLA FICTÍCIA',neighborhood:'BAIRRO FICTÍCIO'}]};
export const fixtureOwner={id:'fixture-owner',email:'owner@example.test',name:'Responsável fictício',role:'owner',scope:''};
export function fixtureTitle(sequence){const n=String(sequence).padStart(8,'0'),a=[...n].reduce((v,x,i)=>v+Number(x)*(i+2),0)%11%10,b=(7+3*8+a*9)%11%10;return n+'13'+a+b;}
export function createMaintenanceFixture({seed=true}={}){
  const sqlite=new DatabaseSync(':memory:');for(const name of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+name,'utf8'));
  const run=(sql,args=[])=>{const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};};
  const db={first:async(sql,args=[])=>sqlite.prepare(sql).get(...args)||null,all:async(sql,args=[])=>sqlite.prepare(sql).all(...args),run:async(sql,args)=>run(sql,args),batch:async commands=>{sqlite.exec('BEGIN');try{const values=commands.map(([sql,args])=>run(sql,args));sqlite.exec('COMMIT');return values;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}first(){return db.first(this.sql,this.args);}async all(){return {results:await db.all(this.sql,this.args)};}run(){return db.run(this.sql,this.args);}}
  const D1={prepare:sql=>new Statement(sql),batch:items=>db.batch(items.map(item=>[item.sql,item.args]))};
  const objects=new Map(),bucket={async put(key,value,options={}){if(options.onlyIf?.get('If-None-Match')==='*'&&objects.has(key))return null;const text=typeof value==='string'?value:await new Response(value).text();objects.set(key,text);return {key};},async get(key){if(!objects.has(key))return null;const text=objects.get(key),etag=createHash('sha256').update(text).digest('hex');return {text:async()=>text,json:async()=>JSON.parse(text),body:new TextEncoder().encode(text),httpEtag:'"'+etag+'"'};},async delete(key){objects.delete(key);},async list(){return {objects:[...objects.keys()].map(key=>({key})),truncated:false};}};
  const records=[];
  if(seed){
    sqlite.exec("INSERT INTO crm_state VALUES('main',1,'',1)");
    const people=[fixtureOwner,{id:'fixture-leader',email:'leader@example.test',name:'Liderança fictícia',role:'leader',scope:'LIDERANÇA FICTÍCIA A'},{id:'fixture-other',email:'other@example.test',name:'Outra liderança fictícia',role:'leader',scope:'LIDERANÇA FICTÍCIA B'}];
    for(const user of people)run('INSERT INTO crm_users(id,email,name,role,scope,created_at) VALUES(?,?,?,?,?,?)',[user.id,user.email,user.name,user.role,user.scope,'2026-01-01T12:00:00.000Z']);
    for(let i=0;i<4;i++){
      const record=cleanRecord({id:'synthetic-'+i,name:'PESSOA FICTÍCIA '+i,title:i===1?'123':fixtureTitle(i+100),zone:'72',section:'372',contact:'91999990000',mother:'MÃE FICTÍCIA '+i,rg:'DOCUMENTO FICTÍCIO',birth:'2000-01-02',leadership:i===3?'LIDERANÇA FICTÍCIA B':'LIDERANÇA FICTÍCIA A',coordinator:'COORDENAÇÃO FICTÍCIA',notes:i===1?'CONFERÊNCIA DOCUMENTAL PENDENTE. Texto fictício.':'Observação fictícia.',source:'Documento fictício p.1',version:1,deleted:i===2});records.push(record);
      run('INSERT INTO crm_records(id,leadership,coordinator,name,title,payload,version,deleted,updated_at) VALUES(?,?,?,?,?,?,1,?,?)',[record.id,record.leadership,record.coordinator,record.name,record.title,JSON.stringify(record),+record.deleted,'2026-01-02T12:00:00.000Z']);
      run('INSERT INTO crm_audit(id,record_id,user_id,user_name,before_value,after_value,operation,created_at) VALUES(?,?,?,?,NULL,?,?,?)',['created-'+record.id,record.id,fixtureOwner.id,fixtureOwner.name,JSON.stringify(record),'cadastrar','2026-01-02T12:00:00.000Z']);
    }
  }
  return {sqlite,db,D1,bucket,objects,records,close:()=>sqlite.close()};
}
