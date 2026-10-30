
## Importação, perfil e ampliação solar

A tela Importar conta aceita até 12 faturas da mesma unidade. O fluxo lê PDF ou imagem no aparelho, apresenta conferência explícita e cria perfil e rascunho vinculados em uma única transação D1. Texto colado também aceita blocos iniciados por `DOCUMENTO: nome.pdf`. A confirmação tem chave idempotente; nova conta da mesma unidade reutiliza o perfil sem sobrescrever contatos. O acesso aos registros exige proprietário autenticado, e o serviço verifica conflitos de documento e vínculo.

Contas com solar distinguem consumo medido da rede, injeção, compensação e energia remanescente. Os lançamentos de compensação e crédito não são contados como economias independentes. Saldo ausente permanece desconhecido; créditos expirados iguais a zero são preservados. Histórico tem duas séries. Leituras contemporâneas têm prioridade sobre valores repetidos no histórico. Geração total e autoconsumo do sistema existente exigem monitoramento do inversor.

O pré-dimensionamento de ampliação usa a demanda remanescente das faturas selecionadas, completa meses sem observação pela média da amostra e aplica a reserva escolhida. A opção de mês crítico atende cada mês simulado. Irradiação, custos, autoconsumo adicional e enquadramento da ampliação são premissas a conferir. Fio B ausente produz custo mínimo parcial, economia como limite superior e retorno a confirmar; não é inferido da TUSD nem do total da conta. A cobrança Fio B participa do piso de disponibilidade; não é necessariamente somada ao piso integral.

Clientes tem painel próprio com visão geral, faturas/histórico, simulação e rastreabilidade. As despesas da conta, manutenção e parcelas ficam separadas. Dados pessoais de demonstrações não fazem parte do código; o usuário importa os documentos na própria base privada.

Validação: 26 testes cobrem conservação de energia, custos, leitura solar e social, perfis, idempotência, isolamento entre usuários e reversão em falha de gravação. TypeScript sem erros. O OCR de imagens complementares pode ser desmarcado em PDFs digitais; páginas omitidas são indicadas no texto extraído, sem inventar conteúdo.

## Raio-X financeiro e demonstrativo fiscal

A apresentação e o cliente exibem três cenários simultâneos: situação atual, compra à vista e financiamento. O valor pago à concessionária, a prestação, a manutenção, a entrada e o investimento inicial permanecem separados. A comparação usa a última fatura sem eventuais ou a média anual, escolhida e salva no projeto. O sistema selecionado fica fixo ao comparar o consumo da última conta. Contas já com solar mantêm essa identificação e comparam a ampliação. Caso prestação + conta residual + manutenção ultrapassem a despesa de referência, a tela mostra aumento de desembolso. O primeiro ano inclui os pagamentos iniciais em linha própria e apenas as parcelas efetivamente devidas no ano.

O demonstrativo fiscal preserva bases, alíquotas e valores destacados no documento. Lançamentos positivos e créditos negativos conciliam com o total; diferenças não identificadas ficam explícitas. Correção monetária, parcelamento, doação e seguro têm leitura própria, além das cobranças já reconhecidas. Informações ausentes não viram zero ou isenção.

A projeção decompõe os tributos que já estão contidos nas tarifas brutas informadas. Não adiciona ICMS, PIS e COFINS novamente ao total. Alíquotas, incidência por parcela, dedução de ICMS da base federal, fonte e conferência são editáveis. Quando uma incidência necessária é desconhecida, o valor do tributo permanece pendente. Energia, Fio B, complemento do mínimo, bandeira, outras despesas e CIP ficam em linhas próprias. A composição líquida + tributos + CIP + ajuste de arredondamento concilia com o total. As alíquotas observadas são hipóteses para o futuro; não há motor automático de legislação tributária, benefícios estaduais ou reforma tributária.

A seleção permite média mensal, cada mês, total anual e anos futuros com as mesmas premissas de reajuste e degradação do modelo principal. TE e TUSD têm campos opcionais; o valor conjunto não é dividido por inferência. A componente Fio B precisa ser informada de forma independente. A decomposição fiscal não altera a tarifa bruta: mudanças reais no preço devem ser inseridas nos campos tarifários. Despesas recorrentes nomeadas alteram os outros encargos do projeto. Nenhum item da conta original é sobrescrito.

Referências primárias consultadas em 29/10/2026:
- ANEEL, tarifas e informações econômico-financeiras: https://www.gov.br/aneel/pt-br/centrais-de-conteudos/relatorios-e-indicadores/tarifas-e-informacoes-economico-financeiras
- MME, tributos cobrados na conta de energia: https://www.gov.br/mme/pt-br/acesso-a-informacao/perguntas-frequentes/tributos-cobrados-na-conta-de-energia
- PGFN, ICMS e tributos na base de cálculo de PIS/COFINS: https://www.gov.br/pgfn/pt-br/cidadania-tributaria/por-assunto/pis-cofins-2/base-de-calculo-de-pis-cofins-1/icms-e-tributos-na-base-de-calculo-pis-cofins

A nomenclatura comercial distingue distribuidores de materiais solares (cotações e kits) de concessionárias de energia (tarifas da fatura). O modelo CSV de cotações usa distribuidor e continua aceitando o cabeçalho anterior fornecedor.

Validação ampliada para 38 testes: conciliação de tributos incluídos, bases e isenções, incidência pendente, recorrências, comparação financeira, prazo abaixo de 12 meses e aumento de desembolso. TypeScript sem erros.

## Estimativa de financiamento até 84 parcelas

Projetos novos iniciam em 84 meses. A simulação aceita prazos inteiros de 1 a 84 meses e compara 12, 24, 36, 48, 60, 72 e 84 parcelas, incluindo também o prazo personalizado selecionado. Projetos salvos conservam suas condições até que o usuário escolha outro prazo e salve. Cliente, apresentação e editor exibem parcela, conta residual média inicial, soma parcela + resíduo, manutenção, diferença mensal e total de entrada + parcelas. A proposta imprimível tem página própria com a mesma comparação. Selecionar uma linha atualiza todas as simulações; preço, entrada, taxa e projeto ficam constantes entre prazos.

A taxa pré-preenchida é apenas uma premissa editável, sem alegação de média bancária ou cotação de crédito. O resíduo é a média inicial conforme a base financeira escolhida, não uma conta fixa para os 84 meses. Fio B ausente mantém resíduo parcial e economia máxima explícitos. Prazo maior com juros reduz a prestação e aumenta o total pago. O total do crédito não incorpora energia nem manutenção.

Validação: 41 testes aprovados, incluindo limite de 84 meses, conservação dos componentes mensais entre prazos, prazo personalizado, juros zero, quitação sem prestação e término das parcelas no sétimo ano.

## Primeira etapa comercial e apresentação protegida

A apresentação é a entrada principal e mostra situação atual, compra à vista e financiamento até 84 meses, com desembolso em reais e percentual da conta de referência. Gráficos de composição mensal, variação ao longo dos meses, Fio B e retorno à vista têm valores rastreáveis. Premissas pendentes permanecem destacadas; não se presume que o resíduo seja uma porcentagem fixa nem uma cobrança mensal constante. A paleta usa azul royal claro e amarelo queimado.

A área interna exige PIN de quatro dígitos além da identidade privada do Sites. Custos, distribuidores, margem e comissões ficam protegidos no servidor; sem sessão interna, propostas retornam apenas a composição comercial necessária ao cliente, preservando o preço final e as parcelas. A apresentação bloqueia a área interna, e a sessão expira em dez minutos. Cinco falhas de PIN geram bloqueio temporário de quinze minutos. O PIN não fica em texto simples no código: o verificador inicial está em variável secreta de produção, vinculado ao email proprietário, e os registros guardam hash PBKDF2 e tokens de sessão com hash.

A comissão pode usar o valor da venda ou o lucro anterior à comissão. O painel calcula comissão em reais, lucro após tributos e comissão, margem efetiva, piso de lucro em reais e percentual e o espaço máximo para negociar. O alerta aparece quando o piso não é atendido. A mão de obra por módulo é livre e negociável; o campo não restringe o prestador à referência inicial. Custos e lucro não aparecem na proposta impressa do cliente.

Distribuidores têm consulta de referências públicas, origem, data, validade, frete a confirmar, cotações próprias e comparação de kits pela geração do projeto. Preço público de varejo não é tratado como custo privado de integrador. Atualizar referências é uma ação explícita e não altera propostas salvas. Não há integração com contas privadas dos distribuidores nem indexação automática ao dólar.

Validação consolidada: 52 testes aprovados, com comissões, piso de lucro, preservação de resultados ao ocultar custos, hash de PIN, restrição do verificador ao proprietário, percentuais de economia/aumento, juros e leitura de preços públicos; TypeScript sem erros.

## Faturas com e sem solar: evidência e componente oficial

O leitor prioriza o bloco de competência, vencimento e total monetário antes de textos próximos ao protocolo fiscal. No modelo antigo, instalação, conta contrato, nome do titular e CPF do boleto são tratados como campos distintos; o CPF não vira unidade consumidora. Cabeçalhos em imagem podem usar nome do arquivo e UF como referência de concessionária, com aviso de conferência. A competência vem do documento e não do nome do PDF.

A análise mostra o efeito líquido de consumo compensado e crédito de injeção. Saldo zero desses lançamentos não determina isenção ou Fio B de uma ampliação. Uma linha explícita de uso da rede GD2 é preservada como valor cobrado, sem tratá-la como componente integral a multiplicar novamente. Contas sem solar preservam tarifa integral e, quando houver, Tarifa Social. Tarifas históricas não são declaradas atuais.

A apresentação consulta componentes tarifárias da ANEEL por nome público da concessionária, subgrupo, classe e data, sem enviar CPF, endereço, UC ou outro identificador pessoal. O seletor exige componente TUSD_FioB, Tarifa de Aplicação, modalidade convencional, vigência e unidade R$/MWh, convertida por 1.000. Valores concorrentes divergentes não são aplicados. O ano anterior é consultado quando necessário para uma vigência iniciada no ano anterior.

A referência pública da Equatorial PA B1 capturada em 29/10/2026 está em lib/data/fio-b-equatorial-pa-2026.json: fonte ANEEL, REH 3.608 de 18/09/2026, vigência 18/09/2026–06/08/2027, componente integral sem tributos 0,379352320561 R$/kWh. Em falha de rede, ela pode ser exibida apenas dentro dessa vigência e dessa classe, identificada como referência arquivada e com data de conferência. A consulta válida em tempo real tem prioridade; ausência ou conflito de dados em resposta válida não é substituído pelo arquivo.

Aplicar a referência é uma ação explícita. A estimativa bruta usa o fator tarifa com tributos / tarifa sem tributos observado na própria conta, identificado como hipótese. Não resolve automaticamente incidências, benefícios sociais, enquadramento GD ou homologação de ampliação. O percentual do ano é aplicado somente pelo motor de cálculo, depois da componente integral. A proposta mantém fonte e data do cálculo, e a conferência tarifária permanece pendente até revisão.

59 testes aprovados e TypeScript sem erros. Os três PDFs reenviados foram processados com a mesma extração geométrica do leitor PDF no navegador e os totais conciliam com os lançamentos identificados. Faturas e dados pessoais não integram o repositório.
