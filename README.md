# Análise Eleitoral Pará 2026

Código da plataforma web, do aplicativo Android instalado e do instalador Windows, preservado neste repositório privado para manutenção e reprodução futura.

| Componente | Versão da entrega | Código e instruções |
| --- | --- | --- |
| Plataforma web e base central | 2.15.0 | `src/`, `public/`, `lib/`, `worker/` e `drizzle/` |
| Android com interface e dados públicos instalados | 2.16.1 | [android-launcher/](android-launcher/README.md) |
| Instalador Windows conectado à plataforma | 2.15.0 | [windows-launcher/](windows-launcher/README.md) |

**Comece pelo [guia para reproduzir o projeto](docs/replicar-projeto.md).** Ele reúne a preparação do ambiente, compilação, testes, configuração de uma nova instância e assinatura dos aplicativos.

O [registro da entrega](docs/entrega-final-2026-10-29.json) identifica versões, código validado e verificações. A branch [`release/entrega-final-2026-10-29`](https://github.com/Wandersontargino/desktop-tutorial/tree/release/entrega-final-2026-10-29) preserva esta referência para consultas futuras.

## Desenvolvimento e validação

Na raiz de uma cópia do repositório, com Node.js 24:

```sh
npm ci
npm run build
npm run check
npx playwright install --with-deps chromium firefox webkit
npm run check:browser
```

O build recompõe os 440 arquivos eleitorais públicos guardados em `.github/public-assets/` e verifica seus hashes SHA-256. O código e `package-lock.json` permitem recompilar a interface e o servidor com as dependências registradas.

Os testes usam contas e pessoas fictícias em banco SQLite temporário. O servidor de testes de navegador escuta somente em localhost com certificado temporário; essa configuração pertence ao ambiente de testes.

## Recursos preservados

- Cadastros, filtros, relatórios, comparação de candidatos e dados eleitorais públicos.
- Duplicidades com observações, revisão de divergências e área de cadastros arquivados.
- Central de Qualidade com responsável, prazo, fonte, histórico e controle de alterações concorrentes.
- Revisão de fotos/PDFs com documento original, confiança do OCR e preservação dos dígitos.
- Cofre offline protegido, revisão das alterações e sincronização com controle de conflitos.
- Backups de servidor criptografados, verificação de integridade e retenção das últimas 14 cópias verificadas.
- Indicadores operacionais agregados, sem conteúdo pessoal nas métricas.

## Verificações contínuas

GitHub Actions executa os testes funcionais, 24 cenários de navegador em Chromium, Firefox, WebKit e tela móvel, a compilação Windows e os testes do aplicativo Android instalado. A entrega Android 2.16.1 passou por 17 verificações em Android 15 e pela conferência dos 555 recursos instalados.

Os workflows ficam em [.github/workflows/platform-checks.yml](.github/workflows/platform-checks.yml) e [.github/workflows/installers.yml](.github/workflows/installers.yml). Também podem ser executados manualmente em **Actions → Run workflow**. Os artefatos dos instaladores permanecem disponíveis por 14 dias; os fontes e instruções ficam versionados no Git.

Dependabot propõe atualizações semanais de npm e Actions. Os workflows usam permissões de leitura e não publicam a plataforma de produção.

## Configuração e dados privados

Esta é a cópia de desenvolvimento sem a base particular. Os dados iniciais privados e as importações históricas foram desativados; o proprietário de exemplo do backend é `owner@example.test`. O guia explica a configuração necessária antes de implantar outra instância.

Senhas, tokens, chaves de servidor, chave de assinatura Android, cópias da base e histórico Git privado permanecem fora deste repositório. A recuperação dos cadastros depende dos backups protegidos e das respectivas chaves, guardados separadamente.

A publicação web usa o acesso privado e a infraestrutura de identidade do provedor. Mantenha os cabeçalhos de identidade sob controle desse provedor. Habilite a rotina de backup de serviço apenas em uma instância confirmada como privada e restrita ao proprietário.
