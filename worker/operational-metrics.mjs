import {database} from './database.mjs';
const bounds=[100,300,1000,3000,10000,30000];
export function metricRoute(path,method='GET'){
  if(path==='/api/maintenance/automatic-backup')return 'backup.automatic';
  if(!path.startsWith('/api/crm/')||path==='/api/crm/operations')return null;
  const operation=path.split('/')[3];
  const allowed=['session','records','sync','quality','duplicates','automatic-backups','recovery-backup','recovery-metadata','members','security','audit','intake'];
  return 'crm.'+(allowed.includes(operation)?operation:'other')+'.'+(method==='GET'?'read':'write');
}
export async function recordOperationalMetric(env,{path,method,status,elapsed,now=new Date()}){
  const route=metricRoute(path,method);if(!route||!env.DB)return;
  const ms=Math.max(0,Math.min(3600000,Math.round(elapsed))),windowStart=now.toISOString().slice(0,13)+':00:00.000Z',bucket=bounds.findIndex(n=>ms<=n),latency=bucket<0?bounds.length:bucket,id=[windowStart,route,status,latency].join('|');
  await database(env).run('INSERT INTO platform_metrics(id,window_start,route,status,latency_bucket,count,total_ms,max_ms,updated_at) VALUES(?,?,?,?,?,1,?,?,?) ON CONFLICT(id) DO UPDATE SET count=count+1,total_ms=total_ms+excluded.total_ms,max_ms=MAX(max_ms,excluded.max_ms),updated_at=excluded.updated_at',[id,windowStart,route,status,latency,ms,ms,now.toISOString()]);
}
export async function readOperationalMetrics(db,{now=new Date()}={}){
  const since=new Date(now.getTime()-24*3600000).toISOString().slice(0,13)+':00:00.000Z',rows=await db.all('SELECT window_start,route,status,latency_bucket,count,total_ms,max_ms FROM platform_metrics WHERE window_start>=? ORDER BY window_start,route',[since]);
  const byRoute=new Map(),timeline=new Map();
  for(const row of rows){
    if(!byRoute.has(row.route))byRoute.set(row.route,{route:row.route,requests:0,errors:0,conflicts:0,rejections:0,totalMs:0,maxMs:0,histogram:Array(bounds.length+1).fill(0)});
    const entry=byRoute.get(row.route);entry.requests+=row.count;entry.errors+=row.status>=500||row.status===408?row.count:0;entry.conflicts+=row.status===409?row.count:0;entry.rejections+=[401,403,429].includes(row.status)?row.count:0;entry.totalMs+=row.total_ms;entry.maxMs=Math.max(entry.maxMs,row.max_ms);entry.histogram[row.latency_bucket]=(entry.histogram[row.latency_bucket]||0)+row.count;
    const hour=timeline.get(row.window_start)||{at:row.window_start,requests:0,errors:0};hour.requests+=row.count;hour.errors+=row.status>=500||row.status===408?row.count:0;timeline.set(row.window_start,hour);
  }
  const routes=[...byRoute.values()].map(entry=>{let amount=0,bucket=0;for(;bucket<entry.histogram.length;bucket++){amount+=entry.histogram[bucket];if(amount>=entry.requests*.95)break;}const {histogram,totalMs,...rest}=entry;return {...rest,meanMs:Math.round(totalMs/entry.requests),p95UpperMs:bounds[bucket]||null};});
  return {since,generatedAt:now.toISOString(),scope:'Operações principais da base; agregação horária. Não inclui cada arquivo público, nem registra documentos ou identificadores pessoais.',requests:routes.reduce((n,r)=>n+r.requests,0),errors:routes.reduce((n,r)=>n+r.errors,0),conflicts:routes.reduce((n,r)=>n+r.conflicts,0),rejections:routes.reduce((n,r)=>n+r.rejections,0),routes,timeline:[...timeline.values()]};
}
