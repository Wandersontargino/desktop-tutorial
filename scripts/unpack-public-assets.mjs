import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
const hash=value=>createHash('sha256').update(value).digest('hex'),root='.github/public-assets/',manifest=JSON.parse(readFileSync(root+'manifest.json','utf8'));
if(manifest.format!=='pa-public-assets-v1'||!manifest.publicOnly)throw Error('Invalid public asset manifest');
const compressed=Buffer.concat(manifest.parts.map(part=>{if(!/^part-\d{3}\.b64$/.test(part.name))throw Error('Invalid part');const value=Buffer.from(readFileSync(root+part.name,'utf8').trim(),'base64');if(value.length!==part.bytes||hash(value)!==part.sha256)throw Error('Public asset part integrity failed');return value;}));
if(hash(compressed)!==manifest.sha256)throw Error('Public asset integrity failed');
const data=JSON.parse(gunzipSync(compressed).toString('utf8'));if(data.format!==manifest.format||data.files.length!==manifest.files)throw Error('Public asset count failed');
for(const file of data.files){if(!/^public\//.test(file.path)||file.path.includes('..')||file.path.includes('\\'))throw Error('Invalid asset path');mkdirSync(dirname(file.path),{recursive:true});writeFileSync(file.path,Buffer.from(file.base64,'base64'));}
console.log('Public electoral assets restored and SHA-256 verified:',data.files.length);
