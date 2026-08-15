---
name: extract_fixed_subquery_to_variable
description: Detecta subconsultas fixas (não correlacionadas) usadas em comparações com colunas no WHERE, que são executadas repetidamente para cada linha, e as reescreve como variáveis para reduzir custo de execução.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - extrair subconsulta
  - subconsulta nao correlacionada
  - subconsulta fixa
  - subconsulta repetida
  - subquery constante
  - reutilizar subconsulta em variavel
---

# Skill: extract_fixed_subquery_to_variable

## Quando usar

Use quando uma cláusula `WHERE` contiver uma subconsulta que retorna um único valor escalar, não depende da linha da consulta externa (ou seja, é fixa) e é usada em uma comparação com uma coluna da tabela principal. Exemplos comuns:

- `WHERE id_regra = (SELECT id FROM regra WHERE nm_regra = 'nomedaregra')`
- `WHERE dt_ultimo_vencimento < (SELECT MAX(dt_ultimo_vencimento) FROM corp_endosso_parcela WHERE cd_forma_pagamento = 81)`

Nessas situações, a subconsulta é reavaliada para **cada linha** processada pela consulta externa, gerando um overhead desnecessário e degradando a performance em conjuntos de dados grandes.

## Instruções

Sua missão é identificar esse padrão e reescrever a consulta movendo a subconsulta fixa para uma variável declarada antes da consulta principal, de modo que ela seja executada uma única vez.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes da tabela envolvida com `get_table_indexes` (opcional, mas útil para verificar se a coluna comparada possui índice e se a reescrita mantém a sargabilidade).
3. Identifique a subconsulta no `WHERE`:
   - Verifique se ela é **não correlacionada** (não faz referência a colunas da consulta externa).
   - Verifique se ela retorna um único valor (escalar) – se retornar múltiplas linhas, a técnica não se aplica (seria necessário `IN` ou `EXISTS`).
4. Reescreva a consulta:
   - Declare uma variável (ex: `@var`) do tipo apropriado.
   - Atribua à variável o resultado da subconsulta.
   - Substitua a subconsulta no `WHERE` pela variável.
   - Execute a consulta principal usando a variável na comparação.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita para variável. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`), a menos que a reescrita permita o uso de um índice existente ou que um índice falte.
   - Se a reescrita mantiver a sargabilidade e um índice adequado já existir na coluna comparada, indique isso.
   - Se a coluna comparada não tiver um índice e a consulta puder se beneficiar de um, conclua a análise e acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Subconsulta fixa dentro do `WHERE`, executada repetidamente linha a linha.

```sql
-- Exemplo 1: Comparação com subconsulta fixa
SELECT id_parcela
FROM corp_endosso_parcela WITH (NOLOCK)
WHERE dt_ultimo_vencimento < (
    SELECT MAX(dt_ultimo_vencimento)
    FROM corp_endosso_parcela
    WHERE cd_forma_pagamento = 81
);

-- Exemplo 2: Outro caso comum
SELECT *
FROM Clientes
WHERE id_regra = (
    SELECT id FROM regra WHERE nm_regra = 'VIP'
);
```
**Solução (DEPOIS):** Extrair a subconsulta para uma variável, executando-a uma única vez.

```sql
-- Exemplo 1 reescrito
DECLARE @datamax DATETIME;
SET @datamax = (
    SELECT MAX(dt_ultimo_vencimento)
    FROM corp_endosso_parcela
    WHERE cd_forma_pagamento = 81
);

SELECT id_parcela
FROM corp_endosso_parcela WITH (NOLOCK)
WHERE dt_ultimo_vencimento < @datamax;

-- Exemplo 2 reescrito
DECLARE @id_regra INT;
SET @id_regra = (SELECT id FROM regra WHERE nm_regra = 'VIP');

SELECT *
FROM Clientes
WHERE id_regra = @id_regra;
```

**Motivo:** A subconsulta fixa, quando colocada diretamente no WHERE, é reavaliada para cada linha candidata, multiplicando o custo de execução. Ao movê-la para uma variável, garantimos que seja executada apenas uma vez, reduzindo drasticamente o tempo de resposta, especialmente em tabelas grandes. A reescrita não altera a lógica e mantém a sargabilidade da comparação com a coluna, desde que a coluna possua índice.

## Recomendação

Sempre que identificar uma subconsulta escalar e não correlacionada no WHERE, extraia-a para uma variável. Essa prática é simples, não modifica o resultado e traz ganhos de performance significativos.
Certifique-se de que o tipo da variável é compatível com o tipo da coluna comparada.
Se a subconsulta puder retornar NULL, lembre-se de tratar adequadamente (ex: SET @var = (SELECT ...) pode resultar em NULL).
Verifique os índices da coluna envolvida na comparação: se não houver um índice, acione o handoff para create_assertive_index para avaliar a criação de um índice que beneficie a consulta.

---
**⚠️ Importante:** Esta skill não cobre subconsultas correlacionadas (que dependem da linha externa) – para esses casos, outras técnicas como EXISTS ou JOIN podem ser mais adequadas, conforme abordado em outras skills.