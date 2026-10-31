# CoopSun — orientações para o assistente

Você está no código da plataforma CoopSun — Propostas & Energia Solar. Responda
em português e comece lendo README.md, docs/ENERGY_ACCOUNTING.md e docs/API.md.
Use o código existente e as verificações do projeto como referência.

## Como trabalhar

- Antes de editar, confira os arquivos e o estado do Git, se disponível. Preserve
  alterações existentes. Apresente um plano curto para o pedido do proprietário.
- A cópia baixada em Configurações é um ambiente de desenvolvimento. Mudanças
  locais só chegam ao Site pelo fluxo de revisão e publicação do proprietário.
- Altere apenas o escopo solicitado. Não substitua a aplicação por uma página de
  demonstração e não crie integrações ou números fictícios para preencher lacunas.
- Não leia nem envie faturas, cadastros, senhas, arquivos de ambiente, bancos
  locais ou backups ao modelo. Use as fixtures sintéticas dos testes.
- A conexão NVIDIA pertence ao iniciador instalado fora deste projeto. Não copie
  a chave para arquivos do repositório, JavaScript, histórico Git ou navegador.

## Regras que os testes devem preservar

- Separe geração, uso instantâneo, retirada, injeção e compensação. Retirada da
  rede também pode ocorrer de dia; não trate toda retirada como consumo noturno.
- Considere as datas e a unidade da fatura ao cruzar leitura do inversor. Não
  confunda reproduzir uma conta com projetar o consumo futuro do projeto.
- Mantenha o Fio B sobre a energia compensada conforme o modelo vigente, após o
  uso direto. Não some novamente tributos já incluídos nem duplique disponibilidade.
- Preserve as hipóteses, fontes, vigências e pendências. Percentuais futuros ou
  preços de exemplo não podem aparecer como fatos oficiais ou valores confirmados.
- Alterações em projeto sugerido e crescimento percentual devem permanecer
  sincronizadas. Alterações de cenário não confirmam custos automaticamente.
- Custos, margens e comissões são internos. O modo cliente não pode expô-los.
- Preserve autenticação, PIN administrativo, isolamento por conta, verificação de
  origem e revisão otimista. Não altere registros reais para executar testes.

## Verificação

Requer Node 22.13+; o CI usa Node 24. Use a versão de pnpm do package.json.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

Execute os testes relacionados às alterações e as verificações obrigatórias do
projeto. Para cálculos, use casos numéricos que verifiquem conservação de energia,
tributos, margens e fluxos, além de exemplos de sucesso. Informe o que passou e
qual verificação depende do Windows, de autenticação ou de um serviço externo.

## Publicação

O Site existente é privado. Preserve sua identidade e seu público. O GitHub
privado guarda o código; o banco de clientes não faz parte deste pacote. Não
publique publicamente nem transfira dados de clientes para serviços externos.
