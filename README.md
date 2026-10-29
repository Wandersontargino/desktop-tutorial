# Plataforma eleitoral — código de manutenção

Este repositório privado contém uma cópia sanitizada da plataforma 2.15.0. Nenhum cadastro real, senha, chave de servidor, cópia da base ou histórico Git privado acompanha o código. Importações históricas e sementes particulares foram desativadas nesta cópia.

## Desenvolvimento e validação

Use Node.js 24, execute `npm ci`, `npm run build`, `npm run check` e `npx playwright install --with-deps` seguido de `npm run check:browser`.

O build confere e recompõe os arquivos eleitorais públicos empacotados em partes, mantendo o restante do código legível. Os testes usam contas e pessoas fictícias em banco SQLite temporário. O servidor de navegador escuta somente em localhost com certificado temporário; a tolerância ao certificado existe apenas nesse teste.

## Verificações contínuas

GitHub Actions verifica o código e 24 cenários de navegador em Chromium, Firefox, WebKit e tela móvel. Dependabot propõe atualizações semanais de npm e Actions. As permissões de execução são somente de leitura, sem credenciais de produção ou publicação automática. Os testes históricos com lotes privados permanecem na manutenção privada e não são distribuídos aqui.

## Recursos implementados

- Central de Qualidade: responsável autorizado, prazo, fonte documental, observação, histórico e proteção contra alterações concorrentes.
- Backup de servidor: AES-GCM, verificação de integridade e estrutura por descriptografia, retenção das últimas 14 cópias verificadas, chave de recuperação protegida e restauração revisável.
- Saúde e backups: duração, falhas e conflitos em métricas agregadas, sem dados pessoais.
- Fotos/PDFs: revisão com o original ao lado, baixa confiança destacada e dígitos literais preservados.

## Produção

Esta cópia não contém o identificador do Site em produção. A publicação continua pelo fluxo privado do Site existente, com revisão e validação. Nunca cadastre tokens, senhas, arquivos de recuperação ou registros pessoais neste repositório. O provedor deve proteger a origem e os cabeçalhos de identidade; a rotina de backup de serviço somente pode ser habilitada atrás do acesso privado do proprietário.
