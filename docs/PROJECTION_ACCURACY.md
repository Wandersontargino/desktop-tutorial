# Conferência de precisão das projeções

## Escopo validado

- A fatura observada é reproduzida pela soma de seus lançamentos, sem forçar a previsão a coincidir com um ciclo histórico.
- Créditos de ciclos anteriores são lançamentos negativos de compensação. O benefício SCEE bruto e o líquido são conciliados separadamente.
- O encargo líquido SCEE observado pode ser usado, por ação explícita, como hipótese adicional por kWh compensado. Não repete os tributos contidos na tarifa bruta do Fio B. Um valor ausente permanece pendente; zero exige indicação e confirmação.
- Uma conta GD2 conciliada da mesma unidade pode fornecer Fio B, SCEE, CIP e bandeira por ação explícita. O Fio B observado já contém o percentual do ano: ele é dividido por esse percentual para recuperar a componente integral. A tarifa integral de energia não é atualizada por essa ação; os valores continuam como hipóteses a validar. GD3 e ampliações não usam esse atalho.
- A comparação por última fatura usa a quantidade tarifada para reproduzir o valor de energia. O dimensionamento preserva o consumo medido e o histórico.
- Novos projetos importados começam com autoconsumo estimado zero. A fração de uso direto exige curva de carga ou medição; não é deduzida da energia injetada.
- Os créditos gerados na projeção seguem para os ciclos posteriores, por antiguidade, com expiração em 60 ciclos. Não há antecipação de excedentes futuros nem receita em dinheiro.
- A compensação é limitada pelo piso de disponibilidade, preservando créditos que apenas substituiriam esse piso. Os tributos adicionais informados integram a parcela considerada no piso.
- O mês inicial é explícito. Cada ciclo usa o percentual de Fio B do seu ano civil, inclusive durante a virada do ano.
- A leitura geométrica de históricos em PDF só acrescenta pares de consumo/injeção quando consegue verificar uma coluna completa e períodos consecutivos. A leitura textual permanece sujeita à conferência.
- A consulta da tarifa integral B1 normaliza a sigla do agente e exclui linhas SCEE, descontos sociais, outras classes e vigências vencidas; não confunde TE específica de compensação com TE de consumo.
- A referência contratual mantém equipamentos, investimento e geração informada identificados. A energia contratual é distribuída pelo perfil sazonal como hipótese; não é apresentada como medição nem como comprovação de desempenho.
- Parcela Price, entrada, conta residual e manutenção permanecem separados. A condição histórica do contrato é exibida separadamente das alternativas de financiamento.
- Custo maior que a referência gera economia negativa; o fluxo de caixa não esconde essa perda.

## Limites materiais

- É um modelo de Grupo B e autoconsumo local. Tarifa Social, incidências específicas, créditos recebidos de outras unidades e demais regimes precisam de conferência individual.
- O saldo inicial dos créditos da previsão é zero. Um saldo histórico identificado na conta não é transportado para uma data anterior nem usado sem conhecer sua validade e alocação.
- Na base de última fatura, a quantidade do ciclo é repetida por mês; o número de dias é destacado e não há normalização diária automática. O histórico anual é preferível para uma projeção sazonal.
- Tarifa integral, CIP e bandeira históricas não são atualizadas só por consultar o Fio B oficial. A origem e a vigência de cada hipótese precisam ser conferidas.
- O encargo adicional SCEE observado é uma referência linear, com o reajuste hipotético da tarifa. Não implementa uma apuração tributária completa por estado ou garante sua permanência futura.
- Geração, autoconsumo, perdas, orientação, sombreamento e limites elétricos do inversor precisam ser verificados no projeto e no monitoramento. Um contrato não comprova a configuração instalada nem a produção efetiva.
- A regra a partir de 2029, a inflação tarifária, a degradação e as despesas futuras são hipóteses explícitas.

## Evidência

77 testes automáticos, incluindo conservação de energia/créditos, expiração, mudança de ano, reconciliação fiscal, referência contratual, financiamento, importação e proteção comercial. TypeScript sem erros. Documentos do usuário foram conferidos localmente; dados pessoais, contratos e faturas reais não integram o repositório nem os testes. Não foram alterados registros reais durante a auditoria.

## Apresentação e proposta

Azul e amarelo preservam a marca; verde identifica resultado favorável, vermelho identifica aumento de custo ou déficit e âmbar destaca parcelas pendentes. Ícones, legendas e textos acompanham as cores. As combinações de texto/fundo semânticas têm contraste mínimo de 5,4:1. A proposta inclui explicação do fluxo de energia, etapas de execução e conferência final; não usa portfólio de terceiros como próprio. Aumento de custo foi verificado na interface com uma taxa hipotética maior, revertida após o teste. O modelo PDF demonstrativo separa faturas observadas de hipóteses de projeção.

## Correção da comparação documental

A visualização inicial de uma fatura distingue os lançamentos efetivamente cobrados das simulações futuras. Duas contas da mesma unidade, em ordem temporal e conciliadas, permitem comparar totais e eventuais sem aplicar uma tarifa hipotética às cobranças observadas. A diferença de ciclos não vira automaticamente economia causal nem payback. Parcela e manutenção adicionais aparecem como hipótese mantendo o custo observado. A proposta de um caso com duas faturas usa o estudo documental.

O campo de projeto sugerido, em kWh/mês, tem base de consumo, margem, meta editável e fonte próprias. Um histórico anterior parcial é identificado; consumo da rede com solar não vira demanda total. Aplicar a sugestão é uma ação explícita para criar um cenário e não altera os documentos. Os testes garantem independência dos valores observados em relação à meta, tarifa ou autoconsumo simulados.
