import fs from 'node:fs';
import path from 'node:path';
import {createWorkspaceArchive} from './claude-workspace.mjs';

const root=path.resolve(import.meta.dirname,'..');
const {archive,fingerprint,files}=createWorkspaceArchive(root);
const output=path.join(root,'lib/generated/claude-workspace.ts');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,'// Generated for the authenticated administrator download route.\n'+
  'export const workspaceSourceBase64='+JSON.stringify(archive.toString('base64'))+';\n'+
  'export const workspaceSourceFingerprint='+JSON.stringify(fingerprint)+';\n'+
  'export const workspaceSourceFiles='+files+';\n');
console.log(`CoopSun: pacote de desenvolvimento preparado (${files} arquivos, ${archive.length} bytes).`);
