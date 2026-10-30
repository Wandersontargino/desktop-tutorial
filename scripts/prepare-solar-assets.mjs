import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const project=path.resolve(import.meta.dirname,'..');
const pdfRoot=path.dirname(require.resolve('pdfjs-dist/package.json'));
const ocrRoot=path.dirname(require.resolve('tesseract.js/package.json'));
const ocrRequire=createRequire(path.join(ocrRoot,'package.json'));
const coreRoot=path.dirname(ocrRequire.resolve('tesseract.js-core/package.json'));
const porRoot=path.dirname(require.resolve('@tesseract.js-data/por/package.json'));
const pub=path.join(project,'public');
fs.mkdirSync(path.join(pub,'ocr/core'),{recursive:true});
fs.mkdirSync(path.join(pub,'ocr/lang'),{recursive:true});
fs.copyFileSync(path.join(pdfRoot,'build/pdf.worker.min.mjs'),path.join(pub,'pdf.worker.min.mjs'));
fs.cpSync(path.join(pdfRoot,'standard_fonts'),path.join(pub,'pdf-fonts'),{recursive:true});
fs.copyFileSync(path.join(ocrRoot,'dist/worker.min.js'),path.join(pub,'ocr/worker.min.js'));
for(const name of fs.readdirSync(coreRoot).filter(n=>n.endsWith('.wasm.js')))fs.copyFileSync(path.join(coreRoot,name),path.join(pub,'ocr/core',name));
fs.copyFileSync(path.join(porRoot,'4.0.0_best_int/por.traineddata.gz'),path.join(pub,'ocr/lang/por.traineddata.gz'));
fs.mkdirSync(path.join(pub,'third-party'),{recursive:true});
for(const [name,root] of [['pdfjs',pdfRoot],['tesseract-core',coreRoot],['tesseract',ocrRoot]]){
 const license=fs.readdirSync(root).find(n=>/^LICENSE/i.test(n));
 if(license)fs.copyFileSync(path.join(root,license),path.join(pub,'third-party',`${name}-LICENSE.txt`));
}
console.log('PDF e OCR português prontos para uso local no navegador.');
