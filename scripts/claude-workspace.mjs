import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';

const ROOT_FILES=new Set(['README.md','CLAUDE.md','AGENTS.md','ABRIR_COOPSUN_COM_IA.cmd',
  'package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.gitignore','.npmrc',
  'cloudflare-env.d.ts','components.json','drizzle.config.ts','eslint.config.mjs',
  'next.config.ts','postcss.config.mjs','tsconfig.json','vite.config.ts']);
const SOURCE_DIRECTORIES=/^(app|components|db|drizzle|docs|hooks|lib|scripts|tests|vendor|worker)\//;
const SOURCE_EXTENSION=/\.(?:[cm]?js|[cm]?ts|tsx|jsx|css|json|md|ya?ml|sql|txt|cmd|sh|LICENSE)$/i;
const SENSITIVE_PARTS=/(?:^|\/)(?:\.env[^/]*|\.dev\.vars[^/]*|\.git|\.wrangler|\.sites-runtime|node_modules|uploads?|backups?|tmp|outputs|work)(?:\/|$)/i;
const PRIVATE_KEY=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{20,}|\bnvapi-[A-Za-z0-9_-]{20,}/;
const MAX_SOURCE_BYTES=12_000_000;

export function allowedWorkspacePath(name) {
  if(!name||name.includes('\\')||path.posix.isAbsolute(name)||name.split('/').some(p=>p==='..'||p.includes(':')))return false;
  if(SENSITIVE_PARTS.test(name)||name==='lib/generated/claude-workspace.ts')return false;
  if(name==='.openai/hosting.json'||name==='.github/workflows/ci.yml'||name==='public/favicon.svg')return true;
  return ROOT_FILES.has(name)||SOURCE_DIRECTORIES.test(name)&&SOURCE_EXTENSION.test(name);
}

function portableFiles(root) {
  const files=[];
  function walk(folder){
    for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
      const absolute=path.join(folder,entry.name),relative=path.relative(root,absolute).split(path.sep).join('/');
      if(entry.isDirectory()){
        if(!SENSITIVE_PARTS.test(relative)&&!relative.startsWith('dist')&&!relative.startsWith('.next')&&!relative.startsWith('.vinext')&&!relative.startsWith('public/'))walk(absolute);
      }else if(entry.isFile())files.push(relative);
    }
  }
  walk(root);return files;
}

export function collectWorkspaceFiles(root) {
  let names;
  try{names=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\0').filter(Boolean);}
  catch{names=portableFiles(root);}
  const files=[];let total=0;
  for(const name of [...new Set(names)].filter(allowedWorkspacePath).sort()){
    const filename=path.join(root,name),stat=fs.lstatSync(filename);
    if(!stat.isFile())throw new Error('Arquivo não regular no pacote: '+name);
    const bytes=fs.readFileSync(filename),text=bytes.toString('utf8');
    if(PRIVATE_KEY.test(text))throw new Error('Possível credencial no código: '+name);
    if((total+=bytes.length)>MAX_SOURCE_BYTES)throw new Error('Pacote de código excede o limite de tamanho.');
    files.push({name:'CoopSun/'+name,bytes});
  }
  for(const required of ['CLAUDE.md','ABRIR_COOPSUN_COM_IA.cmd','package.json']){
    if(!files.some(f=>f.name==='CoopSun/'+required))throw new Error('Falta arquivo necessário: '+required);
  }
  return files;
}

const CRC_TABLE=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let c=0xffffffff;for(const byte of bytes)c=CRC_TABLE[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;}

export function zipFiles(files) {
  const local=[],central=[];let offset=0;
  for(const file of files){
    const name=Buffer.from(file.name,'utf8'),bytes=Buffer.from(file.bytes),packed=deflateRawSync(bytes),crc=crc32(bytes);
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(packed.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(name.length,26);
    const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(8,10);directory.writeUInt16LE(33,14);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(packed.length,20);directory.writeUInt32LE(bytes.length,24);directory.writeUInt16LE(name.length,28);directory.writeUInt32LE(offset,42);
    local.push(header,name,packed);central.push(directory,name);offset+=header.length+name.length+packed.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}

export function createWorkspaceArchive(root) {
  const files=collectWorkspaceFiles(root),hash=createHash('sha256');
  for(const {name,bytes} of files)hash.update(name+'\0'+bytes.length+'\0').update(bytes);
  const fingerprint=hash.digest('hex');
  const metadata=Buffer.from(JSON.stringify({product:'CoopSun',sourceFingerprint:fingerprint,files:files.length,scope:'source-code-only'},null,2));
  const archive=zipFiles([...files,{name:'CoopSun/COOPSUN_WORKSPACE.json',bytes:metadata}]);
  return {archive,fingerprint,files:files.length};
}
