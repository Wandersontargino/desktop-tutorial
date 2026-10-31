import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {allowedWorkspacePath,collectWorkspaceFiles,createWorkspaceArchive} from '../scripts/claude-workspace.mjs';

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'coopsun-workspace-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const write=(name,content)=>{
    const filename=path.join(root,name);fs.mkdirSync(path.dirname(filename),{recursive:true});
    fs.writeFileSync(filename,content);
  };
  write('CLAUDE.md','Regras sintéticas do projeto');
  write('ABRIR_COOPSUN_COM_IA.cmd','@echo off\r\n');
  write('package.json','{"name":"synthetic-coopsun"}');
  return {root,write};
}

test('pacote portátil inclui fonte e exclui dados locais e imagens de clientes',t=>{
  const {root,write}=fixture(t);
  write('app/page.tsx','export default function Page(){return null;}');
  write('tests/synthetic.test.mjs','// synthetic data only');
  for(const name of ['.env','.dev.vars','uploads/client.json','backups/records.json','db/customer.sqlite','docs/invoice.pdf','public/proposal/inspection.jpg','lib/generated/claude-workspace.ts'])write(name,'synthetic-private-data');
  const names=collectWorkspaceFiles(root).map(file=>file.name);
  assert.deepEqual(names,[
    'CoopSun/ABRIR_COOPSUN_COM_IA.cmd','CoopSun/CLAUDE.md','CoopSun/app/page.tsx',
    'CoopSun/package.json','CoopSun/tests/synthetic.test.mjs',
  ]);
});

test('identificação do pacote é estável e muda quando o código muda',t=>{
  const {root,write}=fixture(t);
  const first=createWorkspaceArchive(root),again=createWorkspaceArchive(root);
  assert.equal(first.fingerprint,again.fingerprint);
  assert.deepEqual(first.archive,again.archive);
  write('CLAUDE.md','Regras sintéticas revisadas');
  assert.notEqual(createWorkspaceArchive(root).fingerprint,first.fingerprint);
});

test('código contendo possível chave NVIDIA interrompe a geração',t=>{
  const {root,write}=fixture(t);
  write('app/unsafe.ts','const key="'+'nvapi-'+'x'.repeat(28)+'";');
  assert.throws(()=>createWorkspaceArchive(root),/Possível credencial/);
});

test('pacote incompleto falha em vez de fornecer iniciador sem orientações',t=>{
  const {root}=fixture(t);
  fs.unlinkSync(path.join(root,'CLAUDE.md'));
  assert.throws(()=>createWorkspaceArchive(root),/Falta arquivo necessário: CLAUDE.md/);
});

test('filtro não permite caminhos absolutos, travessia ou arquivos privados',()=>{
  for(const name of ['/app/page.tsx','../app/page.tsx','app/../../private.ts','C:/app/page.tsx','app\\page.tsx','lib/.env.local','docs/backups/client.json','scripts/node_modules/key.js'])assert.equal(allowedWorkspacePath(name),false,name);
  assert.equal(allowedWorkspacePath('.openai/hosting.json'),true);
  assert.equal(allowedWorkspacePath('public/favicon.svg'),true);
});
