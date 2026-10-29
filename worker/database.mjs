export function database(env){
  if(!env.DB)throw Object.assign(new Error('A base central está indisponível. Os dados deste aparelho foram preservados.'),{status:503});
  const prepare=(sql,args=[])=>env.DB.prepare(sql).bind(...args);
  return {prepare,first:(sql,args)=>prepare(sql,args).first(),all:async(sql,args)=>(await prepare(sql,args).all()).results,run:(sql,args)=>prepare(sql,args).run(),batch:items=>env.DB.batch(items.map(([sql,args])=>prepare(sql,args)))};
}
