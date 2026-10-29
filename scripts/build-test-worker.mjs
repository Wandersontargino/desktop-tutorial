import {build} from 'esbuild';
import {readFileSync,mkdirSync} from 'node:fs';
export async function buildTestWorker(outfile='.sites-runtime/e2e-worker.mjs'){
  mkdirSync('.sites-runtime',{recursive:true});
  const candidates=Object.fromEntries(['estadual','federal'].map(office=>[office,JSON.parse(readFileSync('public/data/'+(office==='federal'?'federal/':'')+'statewide.json','utf8')).candidates.map(c=>c.slice(0,3))]));
  const templates=Object.fromEntries(['estadual','federal'].map(office=>[office,JSON.parse(readFileSync('public/data/'+(office==='federal'?'federal/':'')+'regional.json','utf8'))]));
  await build({entryPoints:['worker/index.mjs'],bundle:true,platform:'browser',format:'esm',target:'es2022',outfile,banner:{js:'const CANDIDATE_CATALOG='+JSON.stringify(candidates)+';\nconst TEMPLATES='+JSON.stringify(templates)+';\nconst INITIAL_HTML='+JSON.stringify(readFileSync('public/index.html','utf8'))+';\nconst LOCATION_INDEX='+readFileSync('public/locations-2026.json','utf8')+';'},plugins:[{name:'synthetic-only-test-worker',setup(context){context.onLoad({filter:/[\\/]worker[\\/](?:initial-leadership|authorized-[^\\/]+)\.mjs$/},async args=>{
    if(args.path.endsWith('initial-leadership.mjs'))return {contents:'export default [];',loader:'js'};
    const text=readFileSync(args.path,'utf8'),functions=[...text.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(m=>m[1]),constants=[...text.matchAll(/export\s+(?:const|let)\s+(\w+)/g)].map(m=>m[1]);
    return {contents:functions.map(name=>`export async function ${name}(){return ${name.endsWith('Maintenance')?"new Response(JSON.stringify({error:'Historical import disabled in synthetic tests.'}),{status:403,headers:{'Content-Type':'application/json'}})":"{applied:0}"};}`).join('\n')+'\n'+constants.map(name=>`export const ${name}=[];`).join('\n')+(text.includes('export default')?'\nexport default [];':''),loader:'js'};
  });}}]});
  return outfile;
}
if(process.argv[1]?.endsWith('/build-test-worker.mjs'))await buildTestWorker();
