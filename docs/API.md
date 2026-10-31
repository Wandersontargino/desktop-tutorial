# API da plataforma e integração GitHub

## API do Site privado

As rotas `/api/*` pertencem ao próprio Site. A identidade é obtida pelo gateway autenticado; não existe token de administrador embutido no JavaScript. As gravações exigem a sessão administrativa válida e conferem a origem. O GitHub guarda a fonte, não a base de clientes.

| Método / rota | Finalidade | Contrato principal |
| --- | --- | --- |
| GET `/api/records` | Registros da conta autenticada | `{adminUnlocked, records:[{id,kind,revision,data,createdAt,updatedAt}]}`; fora do administrador remove composição interna de custos |
| POST `/api/records` | Criar/atualizar registro | `{id,kind,revision,data}`; revisão otimista; corpo até 1.000.000 de caracteres e limite de bytes declarado; dados validados por tipo |
| POST `/api/import-bill` | Criar perfil e projeto conferidos de forma atômica | `{requestId,proposal}`; UUID idempotente; vínculo com cliente da própria conta |
| GET `/api/fio-b` | Consultar componente oficial | `agent`, `group`, `at`, `social`; fonte e vigência na resposta |
| GET `/api/tariffs` | Consultar tarifa de energia | Ver parâmetros e filtragem em `app/api/tariffs/route.ts` |
| POST `/api/admin-access` | Autenticar sessão administrativa | Operação interna da interface; não enviar PIN por URL nem versioná-lo |
| GET `/api/development/workspace` | Baixar projeto para Claude Code | ZIP de código da versão publicada; exige identidade e sessão administrativa válida; resposta privada sem cache |

Estados relevantes: 400 para validação, 401 sem identidade, 403 sem sessão administrativa/origem recusada, 409 para conflito de revisão e 413 para tamanho excedido. Os endpoints de alteração não são uma API pública aberta a terceiros. Integrações externas exigem autenticação e autorização próprias; não reutilizar cookies ou credenciais em código-fonte.

## Campos do estudo energético

- `billAnalysis`, `billAnalyses`, `solarComparison`: documentos e comparação por competência/unidade.
- `inverterReadings`: referência, datas do ciclo, geração AC, fonte e confirmação.
- `selfUse`: percentual da geração usado diretamente, limitado ao consumo do cenário.
- `selfUseBasis`: hipótese ou perfil derivado do inversor; percentual, fonte, referência e conferência. Alterar o percentual invalida uma confirmação anterior incompatível.
- `billingAdjustment`: relação documentada entre quantidade tarifada e medição, aplicada somente por escolha explícita. Não representa uso direto.

O formulário de balanço não aceita geração menor que a energia injetada nem datas diferentes das da fatura. Reprodução da fatura e projeção dos próximos meses permanecem bases separadas.

## GitHub Git Data API

O envio da fonte usa o conector autenticado do proprietário. Sequência: verificar repositório privado e permissão, criar ramo isolado, criar blobs binários e árvore da fonte, criar commit e atualizar a referência com verificação do SHA anterior. O ramo principal não é sobrescrito e não se usa `force` para substituir trabalho existente.

O snapshot tem SHA de origem e exclui documentos, cadastros, bancos, ambientes locais e imagens de inspeção. OCR/PDF são regenerados das dependências travadas. A execução CI usa `contents: read`, testes, TypeScript e build, sem credenciais de produção. Publicação em Sites é uma etapa própria; CI não amplia a visibilidade e não recebe a base de clientes.

Referências: [Git Data API](https://docs.github.com/en/rest/git), [checkout](https://github.com/actions/checkout) e [setup-node](https://github.com/actions/setup-node).
