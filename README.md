# CoopSun — Propostas e Energia Solar

Plataforma privada de pré-dimensionamento comercial, análise de faturas, propostas e simulações de consumo para a CoopSun Energy. Implementação original baseada em referências públicas de produtos do setor.

## Operação

- **Visão geral:** indicadores calculados a partir das propostas salvas. Exemplos estão identificados e não são clientes reais.
- **Propostas:** quatro etapas, situação comercial, duplicação, arquivamento e CSV protegido contra fórmulas de planilha.
- **Apresentação:** leitura local de PDF ou imagem, conferência da fatura, inventário de equipamentos, reserva de crescimento, mês crítico, Fio B detalhado e previsão de custos/economia.
- **Fornecedores:** custos de kits, comparação por kWp com frete e importação CSV com prévia. Sem integração comercial contratada ou preços de mercado simulados como reais.
- **Tarifas:** cadastro por concessionária, fonte e vigência; consulta opcional da base ANEEL. A consulta pode falhar sem alterar dados. TE + TUSD não é tarifa final, nem a TUSD inteira equivale ao Fio B.
- **Configurações:** marca, contatos, mão de obra padrão, margem e backup JSON. Restauração cria cópias após prévia, preservando a base atual.

Para entregar uma proposta, salve-a, abra **Apresentar** e use **Imprimir / salvar PDF**. O PDF inclui dados do cliente, escopo, premissas, financiamento, decomposição da conta, histórico lido e fluxo de 25 anos. Custos internos e margem ficam na operação comercial.

## Análise da fatura

O PDF é lido por posição de texto para preservar as colunas. Imagens e PDFs digitalizados usam Tesseract em português no navegador; os arquivos de reconhecimento estão hospedados no próprio Site. O arquivo original não é enviado a terceiros. Texto e campos conferidos são gravados apenas quando o usuário salva a proposta.

O leitor distingue consumo medido, faixas faturadas, tarifa unitária com/sem tributos, benefícios, bandeira, CIP, multa/juros e tributos destacados. Compara a soma dos itens com o total e oferece os últimos 12 meses para dimensionar. A competência vem do documento, não do nome do arquivo. A UC não é confundida com conta contrato nem CPF. Campos não identificados são sinalizados e exigem conferência.

**Tarifa Social:** a análise detalha o benefício, mas a projeção usa uma aproximação pela tarifa média líquida da fatura. Não há motor completo de recálculo da TSEE após adesão ao SCEE. A interface e a proposta identificam essa limitação. Benefícios por faixa, tributação e disponibilidade especial exigem validação específica; não apresentar como simulação tarifária definitiva. Multas e juros não se repetem nas projeções.

## Cálculos

- Geração: kWp × HSP mensal × dias × PR × (1 − perda adicional). Perfil inicial ilustrativo, sujeito à validação do local.
- Reserva: demanda × (1 + percentual), com alternativas por média anual ou mês crítico. Quantidade arredondada para cima. Cenários de kits/inversores redimensionados usam estimativas proporcionais e retiram a confirmação dos custos.
- Conta Grupo B convencional: compensação limitada à energia importada, Fio B sobre energia compensada e disponibilidade tratada como piso da parcela variável. Iluminação e outros fixos são somados depois. Sem monetização de excedentes. Créditos novos são carregados entre ciclos por antiguidade e expiram em 60 meses; o saldo inicial da projeção nova é zero.
- Fio B: transição 2023–2028; após 2028 usa uma hipótese editável, não afirmação de regra futura. Enquadramento legado requer comprovação.
- Preço: custo ÷ (1 − margem − tributos − comissão); desconto reduz a margem efetiva.
- Retorno: 25 anos nominais, reajuste hipotético, degradação, manutenção e reposição. Payback à vista pelo primeiro cruzamento do fluxo acumulado; VPL com taxa informada. Financiamento Price matemático, sem oferta de crédito ou CET garantido.

Pré-dimensionamento não substitui vistoria, projeto elétrico executivo, verificação de MPPT/strings, estrutura, homologação ou responsabilidade técnica.

## Contabilidade da energia

A apresentação separa uso instantâneo, retiradas da rede (também possíveis durante o dia), energia injetada e compensada. Faturas vinculadas são comparadas pela competência impressa e pela mesma conta/unidade. A leitura da geração no inversor deve abranger exatamente as datas da fatura. O balanço calcula uso direto = geração AC − injeção e consumo total = uso direto + retirada; diferenças entre fronteiras de medição e perdas permanecem identificadas. A extrapolação desse perfil para o futuro é uma hipótese.

Zero sem fonte/conferência mantém a projeção pendente. Uma hipótese conferida informa percentual, fonte e referência; não é renomeada como medição futura. Ajustes entre medição e quantidade tarifada são separados do autoconsumo e só são aplicados ao cenário por ação explícita. Consulte [metodologia e fontes](docs/ENERGY_ACCOUNTING.md) e [contratos da API](docs/API.md).

## Desenvolvimento

Node 22.13+ (recomendado 24+), pnpm e o fluxo Sites/Vinext fornecido neste repositório.

```sh
pnpm install
node scripts/prepare-solar-assets.mjs
pnpm run db:generate  # somente ao alterar db/schema.ts
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

A publicação usa o helper Sites e o `.openai/hosting.json` existente. Preserve o `project_id` deste ambiente. Para replicar como outro Site, remova a identidade do Site de uma cópia sanitizada antes de registrar o novo projeto. Não copie estado `.wrangler`, credenciais ou dados de clientes.

O banco D1 é declarado como `DB`. As migrações SQL e o histórico Drizzle são versionados. Publicações aplicam as migrações; nunca criar tabelas durante uma requisição. Recursos de OCR/PDF e respectivas licenças são preparados em `public/` pelo script de assets.

## Acesso e persistência

Sites mantém o acesso privado e a autenticação. APIs exigem a identidade fornecida pelo gateway, filtram registros pelo ID estável da conta, validam o conteúdo, verificam origem de escrita e usam revisão otimista para evitar sobrescrita silenciosa. Credenciais não ficam no navegador nem no código. Não ampliar o público para facilitar integrações ou publicação.

## Verificação

Os testes verificam geração, reserva percentual, mês crítico, conservação de energia, cálculo de Fio B e disponibilidade sem duplicidade, excedentes sem receita, preços/margem, fluxo financeiro, financiamento, inventário e parsing de faturas, incluindo o layout Equatorial com faixas e benefícios. Fixtures de código são sintéticas, sem nomes, endereços ou identificadores reais. A fatura real de referência foi analisada apenas em arquivos temporários ignorados pelo Git.

Referências públicas e limitações também estão acessíveis em **Guia & metodologia**.

## GitHub

O fluxo `.github/workflows/ci.yml` executa testes, verificação de tipos e build em Node 24. Acesso do job limitado a leitura do código; sem dados da base nem credenciais de produção. A publicação em Sites continua no fluxo privado próprio, separada dos testes do GitHub.

`node scripts/export-github-source.mjs /caminho/privado/export.json` prepara um snapshot da fonte rastreada para a API Git do GitHub. Exclui faturas, bancos, ambientes locais, imagens de verificação e assets de OCR/PDF que são regenerados pelo build. Inclui o SHA de origem para rastreabilidade. O script apenas prepara o conteúdo; o envio autenticado usa o conector GitHub ou Git do desenvolvedor. Não inserir tokens no código, no navegador ou no histórico Git.
