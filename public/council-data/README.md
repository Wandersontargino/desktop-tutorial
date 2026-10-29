# Conselho Tutelar de Ananindeua — 2023

`ananindeua-2023.json` reúne duas publicações do COMDICA. Os endereços e nomes preservam a grafia das fontes.

- Resultados: Resolução nº 045/2023, Diário Oficial nº 4197, 20/10/2023, páginas 11–13. https://www.ananindeua.pa.gov.br/midias/midias/6885_diario_de_outubro_20.pdf
- Escolas: Resolução nº 038/2023, Diário Oficial nº 4169, 04/09/2023, páginas 4–7. https://ananindeua.pa.gov.br/midias/midias/6851_diario_de_setembro_04.pdf

Há 131 candidaturas, 34 polos e 124 vínculos de escolas de origem. Polo é identificado por conselho e número: números se repetem entre conselhos. O arquivo não contém votação por polo/escola/urna, zona das seções ou histórico anterior.

Os candidatos do Conselho II somam 13.121 votos. A publicação declara 13.116 válidos. A divergência de 5 votos é preservada, identificada e validada. As participações nominais usam a soma das candidaturas do mesmo conselho; a destinação dos votos usa os totais publicados, que fecham com o comparecimento.

A urna 031, polo 09 do Conselho II (EEEF Antônio Gondim Lins), teve 348 votos anulados. A relação já considera a decisão. Não subtrair novamente nem redistribuir esses votos entre candidatos.

A validação e os relatórios estão em `council-model.js`; a interface em `council.js` e `council.css`. Execute `npm run check:council-tutelar`. Para nova base, confirme a publicação, reconcilie cada conselho e revise os alertas antes de atualizar os dados. Não atribua votos a escolas ou zonas sem boletins e correspondência documental.

## Cadastros, mapa e histórico

`council-register-model.js` associa exclusivamente município, nome documental da escola de origem e seção. Seção isolada e nome aproximado não confirmam polo. O vínculo refere-se ao documento de 2023, sem validar zona histórica, elegibilidade, comparecimento ou voto individual. A aprovação cadastral permanece separada. Títulos válidos repetidos são agrupados apenas no quadro; nomes ou locais divergentes ficam para conferência. A base original permanece preservada.

`council-extras.js` lê a base autorizada somente enquanto desbloqueada. Os dados e relatórios privados são limpos ao bloquear. O CSV territorial é agregado; a listagem nominal de pendências exige seleção explícita no relatório protegido. Teste com `npm run check:council-register`.

Correspondências manuais de nomes de escolas exigem seleção da escola oficial, seção presente no documento e confirmação explícita. São identificadas como conferidas manualmente, ficam neste aparelho e podem ser transferidas em JSON contendo apenas escolas e referências. Elas não alteram a ficha do cadastro nem resolvem conflitos de identidade ou seções ausentes.

O mapa usa o limite municipal IBGE já preparado na plataforma e endereços públicos de escolas. Não há coordenadas de escolas certificadas no documento de 2023. Pontos são desenhados somente após conferência explícita, com fonte e coordenada dentro de Ananindeua. As coordenadas de escolas são guardadas neste aparelho e podem ser transferidas em JSON; nomes, títulos e endereços residenciais dos cadastros não são enviados ao serviço de mapas.

`ananindeua-2019-summary.json` contém somente os totais municipais expressamente publicados na Resolução COMDICA nº 32 de 30/10/2019, publicada em 31/10/2019, página 4: 22.413 válidos, 54 brancos e 259 nulos. Anulados e comparecimento permanecem ausentes. Comparação individual de candidatos e equivalência territorial dos conselhos não foram estabelecidas.
