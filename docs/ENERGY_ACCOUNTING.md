# Contabilidade da energia e fontes

Consulta regulatória: 30/10/2026. Escopo do motor: Grupo B convencional, on-grid, sem bateria; hipóteses futuras expressas. Tarifa Social, Grupo A, sistemas com armazenamento e condições de GD III exigem estudo próprio.

## Grandezas separadas

- Produção AC do inversor = uso direto + injeção, para a mesma janela e fronteira de medição, observadas perdas.
- Consumo total do imóvel = uso direto + retirada da rede.
- Retirada da rede não é apenas consumo noturno. Ela também ocorre com geração insuficiente de dia.
- Quantidade tarifada pode diferir da leitura do medidor por ajustes documentados. Essa diferença não é autoconsumo.
- Compensação é a energia utilizada para abater o consumo faturável, com a injeção e créditos disponíveis, respeitando o mínimo monetário aplicável.

A fatura não mede a produção completa nem o uso direto. O contrato ou a meta mensal não substituem a geração efetiva no mesmo ciclo. O formulário exige datas coincidentes, fonte e conferência antes de usar o perfil do inversor. Usar um perfil histórico nos meses futuros continua sendo uma hipótese; não significa medição futura. O percentual sobre a geração e o percentual sobre o consumo total são exibidos separadamente.

## Faturamento e créditos

O motor apura uso direto, retirada e injeção antes da compensação. O Fio B usa os kWh compensados. Na transição GD II: 60% da componente em 2026, 75% em 2027 e 90% em 2028, pelo ano civil de cada mês. Uma tarifa unitária efetivamente cobrada na linha GD2 já inclui o percentual daquele ciclo; na reprodução ela não é multiplicada de novo. Converter essa tarifa em componente integral requer dividir pelo percentual do ano observado.

Após 2028, a percentagem do modelo é hipótese editável: o art. 17 prevê regras tarifárias da ANEEL, e não uma garantia de 100% da mesma componente. O enquadramento de cada unidade precisa ser comprovado.

A disponibilidade é um piso da parcela variável, não um acréscimo repetido. Novos créditos são utilizados por antiguidade e expiram após 60 ciclos. A projeção nova inicia sem saldo histórico; o saldo real é exibido na conferência documental, sem inventar sua distribuição por vencimento. A conferência entre saldos exige ciclos consecutivos, saldo e expiração expressos; divergências podem indicar outros créditos, alocações ou ajustes.

## Tributos e períodos

ICMS, PIS e COFINS destacados já integram os lançamentos brutos. O efeito entre benefício SCEE bruto e líquido é mostrado separadamente do Fio B, sem presumir uma incidência universal. A hipótese por kWh derivada de uma fatura tem fonte e referência e exige revisão para o cliente/período futuro. Sem base suficiente, a parcela permanece pendente.

As faturas são conciliadas até os centavos. Multa, juros e correção ficam separados do custo recorrente. Competência, duração do ciclo, tarifas, CIP e bandeira são preservadas; nomes de arquivos divergentes geram aviso. Diferença histórica de contas não é, por si só, economia causal normalizada nem comprova dimensionamento anual.

## Fontes primárias

- [Lei 14.300/2022 atualizada, arts. 16, 17, 26 e 27](https://www2.camara.leg.br/legin/fed/lei/2022/lei-14300-6-janeiro-2022-792217-normaatualizada-pl.html).
- [REN ANEEL 1.059/2023: regras incorporadas à REN 1.000/2021, arts. 655-I, 655-L e 655-Q](https://www2.aneel.gov.br/cedoc/ren20231059.pdf).
- [Cartilha de Geração Distribuída Equatorial, junho/2025, pp. 8-10](https://pi.equatorialenergia.com.br/siteantigo/wp-content/uploads/2025/07/Cartilha_GD_24062025.pdf).
- [Componentes tarifárias ANEEL](https://dadosabertos.aneel.gov.br/dataset/componentes-tarifarias): agente, classe e vigência são parte da referência. A TUSD completa não é a componente Fio B.

Os testes de código usam dados fictícios. Faturas de clientes, identificadores, relatórios do inversor e bases de produção ficam fora da distribuição do código-fonte.
# Precisão da projeção e conferência histórica

Novos projetos importados mantêm o consumo atual como hipótese inicial. A reserva de geração não cria demanda automaticamente; crescimento de consumo continua disponível por escolha explícita.

`lib/forecast-accuracy.ts` reúne ciclos conferidos do inversor na mesma unidade, com datas alinhadas e sem sobreposição. O uso direto é ponderado pelos kWh gerados. O consumo total é reconstruído por uso direto + retirada da rede e normalizado pelos dias dos ciclos. Aplicar o perfil requer pelo menos três ciclos e altera somente o rascunho, preservando a meta de geração. Esse mínimo é um critério operacional, sem representar garantia estatística. Perfis de bateria e da geração adicional de uma ampliação exigem estudo próprio.

A diferença entre conta observada e média simulada é decomposta em volume compensado, tarifas/ajustes por kWh, energia residual/mínimo, CIP, bandeira e outras despesas. Comparar períodos diferentes não mede o erro de uma previsão para o mesmo ciclo.

O teste retrospectivo de encargos usa somente a fatura anterior como referência de tarifa, com ajuste do percentual legal do ano. Os kWh da fatura testada são mantidos conhecidos. O desvio absoluto médio resultante avalia apenas Fio B + SCEE; não valida a previsão de consumo, geração ou conta total. A fatura testada não participa de sua própria calibração. Nenhuma margem universal de acerto é declarada.

## Apresentação das contas reais

Ao abrir uma proposta com documentos, a apresentação começa pelas faturas reais,
inclusive em modo de leitura. A escolha entre contas e projeção vale para a tela
atual; uma opção antiga salva no rascunho não força a projeção na reabertura.
O resumo mostra os totais antes e com solar, a diferença histórica e a composição
da conta solar. Diferenças entre ciclos não são renomeadas como economia causal.

Faturas conferidas de outros rascunhos carregados da mesma conta/unidade são
reunidas na leitura do projeto. Isso preserva o rascunho salvo e não altera
consumo, tarifas, sistema ou autoconsumo. Documentos de outra unidade são recusados.
Os valores projetados ficam na opção explícita de simular o projeto futuro.
Uma componente ausente ou uma fatura não conciliada não vira valor zero validado.
Ao selecionar um projeto salvo, o navegador lembra apenas seu identificador. Na
reabertura, ele só é restaurado se continuar entre os registros autorizados da
conta atual e não estiver arquivado. Faturas e dados financeiros não são gravados
nesse armazenamento. A opção de nova proposta limpa essa preferência.

