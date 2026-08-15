---
name: avoid_multiple_table_scans_with_case
description: Detecta consultas que varrem a mesma tabela múltiplas vezes para obter diferentes agregações (ex: usando subconsultas ou UNION) e recomenda usar CASE dentro de uma única consulta com GROUP BY para realizar todas as agregações em uma única passada, melhorando a performance.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - varias leituras da mesma tabela
  - agregacao multipla
  - multiplas leituras
  - mesmo scan varias vezes
  - varias passagens na tabela
  - leitura repetida da tabela
---

# Skill: avoid_multiple_table_scans_with_case

## Quando usar

Use quando uma consulta precisar calcular múltiplas métricas (como contagens, somas, máximos, etc.) sobre a mesma tabela, mas baseadas em diferentes condições (ex: contagem de registros com status A, contagem de registros com status B, soma de valores para um determinado grupo, etc.), e a consulta estiver sendo feita com:

- Múltiplas subconsultas no `SELECT` (cada uma varrendo a tabela);
- Múltiplas consultas unidas com `UNION` (cada uma com um `WHERE` diferente);
- Múltiplas tabelas temporárias com dados da mesma origem.

Nesses casos, a tabela é varrida várias vezes, causando desperdício de I/O, CPU e tempo de execução. A técnica recomendada é usar **agregação condicional com `CASE`** dentro de uma única consulta, com `GROUP BY` quando necessário, para realizar todas as métricas em uma única passada.

## Instruções

Sua missão é identificar consultas que varrem a mesma tabela múltiplas vezes para obter diferentes agregações e reescrevê-las para usar `CASE` dentro de funções agregadas (`SUM`, `COUNT`, `MAX`, `MIN`, `AVG`) em uma única consulta.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes da tabela envolvida com `get_table_indexes`.
3. Analise a consulta:
   - Localize subconsultas no `SELECT` que fazem `COUNT`, `SUM`, `MAX`, etc. sobre a mesma tabela, com diferentes condições.
   - Localize consultas unidas com `UNION` que selecionam da mesma tabela com diferentes filtros para agregar resultados.
   - Localize scripts que criam múltiplas tabelas temporárias a partir da mesma tabela com diferentes condições, e depois as combinam.
4. Reescreva a consulta:
   - Use `SUM(CASE WHEN condicao THEN 1 ELSE 0 END)` para contagens condicionais.
   - Use `SUM(CASE WHEN condicao THEN valor ELSE 0 END)` para somas condicionais.
   - Use `MAX(CASE WHEN condicao THEN campo ELSE NULL END)` para máximos condicionais.
   - Use `COUNT(CASE WHEN condicao THEN 1 ELSE NULL END)` para contagens (o `NULL` é ignorado pelo `COUNT`).
   - Agrupe os dados uma única vez usando `GROUP BY` se houver agrupamento.
   - Execute a consulta uma única vez, obtendo todas as métricas.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita para evitar múltiplas varreduras. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Verifique se existem índices adequados para as condições usadas nos `CASE` (ex: índices nas colunas usadas no `WHERE` e no `GROUP BY`). Mencione-os.
   - Se faltar índices para melhorar ainda mais a consulta, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Múltiplas varreduras na mesma tabela para obter diferentes métricas.

```sql
-- Exemplo extraído do PDF: Consulta com múltiplas subconsultas ou passes na tabela corp_endosso
-- (versão ineficiente)
SELECT
    (SELECT MAX(dt_emissao) FROM corp_endosso WHERE cd_tipo_endosso = 0) AS [Maior emissao tipo 0],
    (SELECT COUNT(*) FROM corp_endosso WHERE cd_tipo_endosso = 0) AS [Quantidade tipo 0],
    (SELECT SUM(vl_premio_risco) FROM corp_endosso WHERE cd_tipo_endosso = 0) AS [Soma Premios tipo 0],
    (SELECT MAX(dt_emissao) FROM corp_endosso WHERE cd_tipo_endosso = 1) AS [Maior emissao tipo 1],
    (SELECT COUNT(*) FROM corp_endosso WHERE cd_tipo_endosso = 1) AS [Quantidade tipo 1],
    (SELECT SUM(vl_premio_risco) FROM corp_endosso WHERE cd_tipo_endosso = 1) AS [Soma Premios tipo 1],
    (SELECT COUNT(*) FROM corp_endosso WHERE dt_emissao <= '2021-12-31') AS [Quantidade antigos],
    (SELECT COUNT(*) FROM corp_endosso WHERE dt_emissao > '2021-12-31') AS [Quantidade 2022];
```

**Solução (DEPOIS):** Usar agregação condicional com `CASE` em uma única consulta, varrendo a tabela uma única vez.

```sql
-- Exemplo reescrito: Uso de CASE dentro de funções agregadas
SELECT
    MAX(CASE WHEN cd_tipo_endosso = 0 THEN dt_emissao ELSE NULL END) AS [Maior emissao tipo 0],
    COUNT(CASE WHEN cd_tipo_endosso = 0 THEN 1 ELSE NULL END) AS [Quantidade tipo 0],
    SUM(CASE WHEN cd_tipo_endosso = 0 THEN vl_premio_risco ELSE 0 END) AS [Soma Premios tipo 0],
    MAX(CASE WHEN cd_tipo_endosso = 1 THEN dt_emissao ELSE NULL END) AS [Maior emissao tipo 1],
    COUNT(CASE WHEN cd_tipo_endosso = 1 THEN 1 ELSE NULL END) AS [Quantidade tipo 1],
    SUM(CASE WHEN cd_tipo_endosso = 1 THEN vl_premio_risco ELSE 0 END) AS [Soma Premios tipo 1],
    COUNT(CASE WHEN dt_emissao <= '2021-12-31' THEN 1 ELSE NULL END) AS [Quantidade antigos],
    COUNT(CASE WHEN dt_emissao > '2021-12-31' THEN 1 ELSE NULL END) AS [Quantidade 2022]
FROM corp_endosso
WHERE cd_tipo_endosso IN (0, 1);
```

**Motivo:** Cada subconsulta no `SELECT` original executa uma varredura completa na tabela `corp_endosso` (a menos que haja índices, mas ainda assim são acessos separados). Para 8 métricas, a tabela é varrida 8 vezes. Com a técnica de agregação condicional, a tabela é varrida **uma única vez**, e todas as métricas são calculadas durante essa única passagem. Isso reduz drasticamente o custo de I/O e CPU, especialmente em tabelas grandes.

**Observação:** O `COUNT(CASE WHEN condicao THEN 1 ELSE NULL END)` funciona porque o `COUNT` ignora valores `NULL`. Alternativamente, pode-se usar `SUM(CASE WHEN condicao THEN 1 ELSE 0 END)` para o mesmo efeito. Para o `MAX`, o `ELSE NULL` assegura que a condição seja ignorada quando falsa.

## Recomendação

- Sempre que precisar de múltiplas métricas baseadas em diferentes condições sobre a mesma tabela, use `CASE` dentro de agregações.
- Se a consulta também tiver `GROUP BY`, assegure-se de que as colunas de `GROUP BY` estejam indexadas para eficiência.
- Evite criar múltiplas tabelas temporárias ou fazer múltiplos `SELECT`s com `UNION` para agregar dados da mesma fonte – a técnica de `CASE` é mais eficiente.
- Essa prática também é aplicável para relatórios e dashboards que exigem várias estatísticas.
- Verifique se os índices existentes cobrem as colunas usadas nas condições (`cd_tipo_endosso` e `dt_emissao` no exemplo). Se não, acione o handoff para `create_assertive_index` para avaliar a criação de índices que otimizem ainda mais a consulta.

---
**⚠️ Importante:** Essa técnica funciona melhor quando a tabela é grande e as condições são relativamente simples. Se as condições forem muito complexas (ex: envolvendo joins com outras tabelas), pode ser necessário avaliar a performance com dados reais. No entanto, a regra geral é **sempre preferir uma única passada sobre a tabela a múltiplas passadas**.