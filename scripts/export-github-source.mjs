import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),output=process.argv[2];
if(!output||!path.isAbsolute(output)||output.startsWith(root+path.sep))throw new Error('Informe um JSON absoluto fora do checkout, em diretório privado.');
const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const excluded=/^(?:upload|uploads|tmp|backups|node_modules|dist|\.wrangler|\.sites-runtime)\/|(?:^|\/)\.env|(?:^|\/)\.dev\.vars|\.(?:sqlite3?|pem|pdf|xlsx|csv)$/i;
const generated=/^public\/(?:ocr\/|pdf-fonts\/|pdf\.worker\.min\.mjs$)|^docs\/.*\.(?:jpg|jpeg|png|webp)$/i;
const files=[];
for(const name of tracked){
 if(excluded.test(name)||generated.test(name))continue;
 const file=path.join(root,name),stat=fs.lstatSync(file);if(!stat.isFile())throw new Error('Arquivo não regular: '+name);
 const bytes=fs.readFileSync(file),decoded=bytes.toString('utf8'),binary=bytes.includes(0)||!Buffer.from(decoded,'utf8').equals(bytes);
 if(!binary&&/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{20,}/.test(decoded))throw new Error('Possível credencial em '+name);
 files.push({path:name,mode:stat.mode&0o111?'100755':'100644',encoding:binary?'base64':'utf-8',content:binary?bytes.toString('base64'):decoded,size:bytes.length});
}
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
fs.writeFileSync(output,JSON.stringify({sourceCommit,files}),{mode:0o600});
console.log(JSON.stringify({output,sourceCommit,files:files.length,binaryFiles:files.filter(f=>f.encoding==='base64').length,sourceBytes:files.reduce((s,f)=>s+f.size,0)}));
