import { build } from 'esbuild';
import {createHash} from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cityPlaces } from '../lib/election-model.mjs';
import electionArchive from '../public/election-archive-model.js';
rmSync('dist', {recursive:true,force:true});
mkdirSync('dist/server',{recursive:true}); mkdirSync('dist/.openai',{recursive:true});
cpSync('public','dist/client',{recursive:true});
cpSync('lib/election-model.mjs','dist/client/election-model.mjs');
cpSync('lib/crm-model.mjs','dist/client/crm-model.mjs');
cpSync('drizzle','dist/drizzle',{recursive:true});
cpSync('lib/election-model.mjs','dist/server/election-model.mjs');
const template = Object.fromEntries(['estadual','federal'].map(o=>[o,JSON.parse(readFileSync(`public/data/${o==='federal'?'federal/':''}regional.json`,'utf8'))]));
const candidateCatalog=Object.fromEntries(['estadual','federal'].map(office=>[office,JSON.parse(readFileSync('public/data/'+(office==='federal'?'federal/':'')+'statewide.json','utf8')).candidates.map(c=>c.slice(0,3))]));
const html=readFileSync('public/index.html','utf8');
const locationIndex=JSON.parse(readFileSync('public/locations-2026.json','utf8'));
for(const office of ['estadual','federal']){
  const directory='data/'+(office==='federal'?'federal/':'');const index=JSON.parse(readFileSync('public/'+directory+'index.json','utf8'));
  const cities=index.municipalities.map(([code])=>JSON.parse(readFileSync('public/'+directory+code+'.json','utf8')));
  const places=cities.flatMap(cityPlaces);
  writeFileSync('dist/client/'+directory+'places.json',JSON.stringify({electionYear:2026,office,turn:1,source:index.source,places}));
  // The immutable bundled version is pre-aggregated, avoiding 144 fetches on mobile.
  // Imported versions are aggregated from their own captured manifest in the client.
  mkdirSync('dist/client/history-data/2026',{recursive:true});
  const summary=electionArchive.fromCurrent(index,JSON.parse(readFileSync('public/'+directory+'statewide.json','utf8')),template[office],cities,JSON.parse(readFileSync('public/'+directory+'candidate-parties-2026.json','utf8')),'bundled');
  writeFileSync('dist/client/history-data/2026/'+office+'.json',JSON.stringify(summary));
}
await build({stdin:{contents:readFileSync('worker/index.mjs','utf8'),resolveDir:process.cwd()+'/worker',sourcefile:'index.mjs'},bundle:true,platform:'browser',format:'esm',target:'es2022',outfile:'dist/server/index.js',banner:{js:`const CANDIDATE_CATALOG = ${JSON.stringify(candidateCatalog)};\nconst INITIAL_HTML = ${JSON.stringify(html)};\nconst TEMPLATES = ${JSON.stringify(template)};\nconst LOCATION_INDEX = ${JSON.stringify(locationIndex)};`}});
await build({entryPoints:['src/crossing-view.mjs'],bundle:true,platform:'browser',format:'iife',target:'es2022',outfile:'dist/client/crossing-view.js'});
await build({entryPoints:['src/ocr-loader.mjs'],bundle:true,platform:'browser',format:'iife',target:'es2022',minify:true,outfile:'dist/client/ocr-runtime.js'});
await build({entryPoints:['src/pdf-loader.mjs'],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,external:['node:*','@napi-rs/canvas'],outfile:'dist/client/pdf-runtime.js'});
mkdirSync('dist/client/vendor/pdf',{recursive:true});
cpSync('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs','dist/client/vendor/pdf/pdf.worker.min.mjs');
cpSync('node_modules/pdfjs-dist/standard_fonts','dist/client/vendor/pdf/standard_fonts',{recursive:true});
cpSync('node_modules/pdfjs-dist/wasm','dist/client/vendor/pdf/wasm',{recursive:true});
await build({entryPoints:['src/crm-workspace.mjs'],bundle:true,platform:'browser',format:'iife',target:'es2022',outfile:'dist/client/crm-workspace.js'});
mkdirSync('dist/client/vendor/ocr/core',{recursive:true});
cpSync('node_modules/tesseract.js/dist/worker.min.js','dist/client/vendor/ocr/worker.min.js');
const coreNames=(await import('node:fs')).readdirSync('node_modules/tesseract.js-core').filter(n=>/\.wasm(?:\.js)?$/.test(n));
for(const name of coreNames)cpSync('node_modules/tesseract.js-core/'+name,'dist/client/vendor/ocr/core/'+name);
const {readdirSync,statSync}=await import('node:fs');
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name]);
const assets=walk('dist/client').filter(p=>!p.includes('/data/')&&!p.endsWith('offline-files.json')&&!p.endsWith('sw.js')).map(p=>'/'+p.slice('dist/client/'.length));
const electionFiles={};for(const office of ['estadual','federal']){const path='public/data'+(office==='federal'?'/federal':'');electionFiles[office]=walk(path).filter(p=>p.endsWith('.json')&&!(office==='estadual'&&p.startsWith(path+'/federal/'))).map(p=>p.slice(path.length+1));electionFiles[office].push('places.json');}
writeFileSync('dist/client/offline-files.json',JSON.stringify({assets,electionFiles}));
const bundledHash=createHash('sha256');
for(const path of walk('dist/client/data').sort()){bundledHash.update(path.slice('dist/client/'.length));bundledHash.update(readFileSync(path));}
writeFileSync('dist/client/sw.js',readFileSync('public/sw.js','utf8').replace('__PA_BUNDLED_REVISION__',bundledHash.digest('hex')));
cpSync('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Plataforma construída: dados, interface e atualização persistente.');
