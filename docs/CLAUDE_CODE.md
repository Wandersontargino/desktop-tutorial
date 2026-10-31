# Desenvolver a CoopSun com o Claude Code

## Abrir o projeto no Windows

1. Na plataforma, desbloqueie o administrador e abra **Configurações → Projeto
   para Claude Code → Baixar projeto**.
2. Use **Extrair tudo** no ZIP. Entre na pasta `CoopSun` extraída.
3. Abra `ABRIR_COOPSUN_COM_IA.cmd` com dois cliques.

O arquivo chama o iniciador automático já configurado em
`%USERPROFILE%\CoopSun-IA\ABRIR_CLAUDE_COOPSUN.cmd`, passando a pasta correta.
Ele usa a chave NVIDIA salva no computador. Reconheça o caminho antes de aceitar
a confirmação de confiança da pasta exibida pelo Claude Code.

Um primeiro pedido útil:

> Leia CLAUDE.md e o código da CoopSun. Faça uma revisão de desempenho e segurança
> e confira os testes. Explique os problemas encontrados e proponha um plano curto
> antes de modificar o projeto. Responda em português.

## Conteúdo e limites da cópia

O pacote reúne código, testes sintéticos, documentação e o iniciador. Não contém
o banco, cadastros, faturas, credenciais ou fotos de clientes. Recursos de OCR/PDF
são recriados das dependências pelo build. Imagens raster de apresentação não
fazem parte da cópia de análise; o Site publicado conserva seus próprios assets.

O pacote inclui uma impressão digital do código em `COOPSUN_WORKSPACE.json`.
O download exige autenticação e a sessão administrativa válida. O ZIP não é
incluído nos arquivos públicos do Site nem no JavaScript do navegador.

## Validar e levar alterações ao Site

Use Node 22.13+ e a versão de pnpm indicada no package.json. Execute `pnpm test`,
`pnpm typecheck` e `pnpm build`. Esses comandos preparam os módulos gerados
necessários; mantenha os arquivos de lock.

A cópia local não grava na base de produção nem publica alterações por si só.
Revise o diff e os testes e encaminhe o código pelo repositório privado ou pelo
fluxo de edição do proprietário em Sites. Preserve o project_id existente e o
acesso privado. Não copie os dados ou a chave NVIDIA para o repositório.
