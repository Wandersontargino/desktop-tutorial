import test from 'node:test';
import assert from 'node:assert/strict';
import {developmentSourceResponse} from '../lib/development-source.ts';

const url='https://coopsun.example/api/development/workspace';
function setup(overrides={}) {
  let reads=0;
  return {deps:{
    getUser:async()=>({userId:'synthetic-owner'}),
    hasAdminAccess:async(request,userId)=>{
      assert.equal(userId,'synthetic-owner');
      assert.equal(request.url,url);
      return true;
    },
    readArchive:async()=>{reads++;return new Uint8Array([80,75,3,4,0,255]);},
    ...overrides,
  },reads:()=>reads};
}

test('download de fonte exige identidade antes de acessar o pacote',async()=>{
  const fixture=setup({getUser:async()=>null,hasAdminAccess:async()=>assert.fail('Não consultar PIN sem identidade')});
  const response=await developmentSourceResponse(new Request(url),fixture.deps);
  assert.equal(response.status,401);
  assert.equal(fixture.reads(),0);
  assert.match(response.headers.get('cache-control'),/no-store/);
});

test('download de fonte exige a sessão administrativa da conta',async()=>{
  const fixture=setup({hasAdminAccess:async()=>false});
  const response=await developmentSourceResponse(new Request(url),fixture.deps);
  assert.equal(response.status,403);
  assert.equal(fixture.reads(),0);
});

test('download de fonte recusa origem externa antes de carregar códigos',async()=>{
  const fixture=setup({hasAdminAccess:async()=>assert.fail('Não consultar PIN para origem recusada')});
  const response=await developmentSourceResponse(new Request(url,{headers:{origin:'https://other.example'}}),fixture.deps);
  assert.equal(response.status,403);
  assert.equal(fixture.reads(),0);
});

test('administrador recebe ZIP binário privado como anexo',async()=>{
  const fixture=setup();
  const response=await developmentSourceResponse(new Request(url,{headers:{origin:'https://coopsun.example'}}),fixture.deps);
  assert.equal(response.status,200);
  assert.equal(fixture.reads(),1);
  assert.equal(response.headers.get('content-type'),'application/zip');
  assert.match(response.headers.get('content-disposition'),/^attachment;.*\.zip"$/);
  assert.match(response.headers.get('cache-control'),/private, no-store/);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('content-length'),'6');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),new Uint8Array([80,75,3,4,0,255]));
});

test('falha de preparação não divulga detalhes internos',async()=>{
  const fixture=setup({readArchive:async()=>{throw new Error('sensitive-internal-path');}});
  const response=await developmentSourceResponse(new Request(url),fixture.deps);
  assert.equal(response.status,503);
  assert.doesNotMatch(await response.text(),/sensitive-internal-path/);
});
