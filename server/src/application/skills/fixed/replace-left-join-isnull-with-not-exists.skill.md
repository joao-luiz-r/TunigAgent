---
name: replace_left_join_isnull_with_not_exists
description: Detecta LEFT JOINs com condição IS NULL na tabela joinada (anti-join) que são usados para filtrar registros sem correspondência, e os reescreve como NOT EXISTS para melhorar a performance, evitando processamento desnecessário e permitindo que o otimizador use anti-semi-joins.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - left join is null
  - anti join
  - left join com is null
  - registros sem correspondencia
  - usar not exists
  - anti join em vez de left join
---

# Skill: replace_left_join_isnull_with_not_exists

## Quando usar

Use quando uma consulta utiliza um `LEFT JOIN` com uma tabela e, na cláusula `WHERE`, filtra apenas os registros onde a coluna da tabela joinada é `NULL`. Esse padrão é comumente usado para encontrar registros da tabela principal que **não possuem** correspondência na tabela secundária (anti-join).

Exemplo típico:

- `FROM tabela1 LEFT JOIN tabela2 ON tabela1.id = tabela2.fk_id WHERE tabela2.id IS NULL`

Nesse cenário, o `LEFT JOIN` combinado com `IS NULL` força o SQL Server a processar todas as combinações (incluindo as correspondentes) antes de filtrar as que não têm correspondência. Substituir por `NOT EXISTS` é mais eficiente, pois o otimizador pode usar uma *anti-semi-join*, parando na primeira correspondência e evitando processamento extra.

**⚠️ NÃO confunda:** esta skill é apenas para o anti-join (`LEFT JOIN` com `IS NULL` / `NOT EXISTS`). Se o JOIN for usado só para filtrar **sem** `IS NULL`, use `[SKILL_HANDOFF:replace_join_with_exists]`. Se houver `JOIN + DISTINCT` desnecessário, use `[SKILL_HANDOFF:replace_join_distinct_with_exists]`.

## Instruções

Sua missão é identificar `LEFT JOIN` com `IS NULL` que podem ser substituídos por `NOT EXISTS` e reescrever a consulta de forma a manter o mesmo resultado, melhorando a performance.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Analise a consulta:
   - Verifique se há um `LEFT JOIN` seguido por uma condição `WHERE` que testa se uma coluna da tabela joinada é `NULL` (ex: `WHERE tabela2.id IS NULL`).
   - Confirme que o `LEFT JOIN` é usado exclusivamente para esse filtro de não-existência, e que nenhuma coluna da tabela joinada é selecionada ou usada em outras cláusulas.
4. Reescreva o `LEFT JOIN` utilizando `NOT EXISTS` com uma subconsulta correlacionada.
   - Mantenha todas as outras cláusulas (`WHERE`, `GROUP BY`, etc.) inalteradas.
   - Remova o `LEFT JOIN` e a condição `IS NULL`.
   - Adicione uma cláusula `WHERE NOT EXISTS (SELECT 1 FROM tabela2 WHERE tabela2.fk_id = tabela1.id)`.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita do `LEFT JOIN` para `NOT EXISTS`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes, mencione isso.
   - Se faltar índices para a subconsulta, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Uso de `LEFT JOIN` com `IS NULL` para filtrar registros sem correspondência, causando processamento desnecessário.

```sql
-- Exemplo extraído do PDF: Buscar clientes que não possuem endosso
SELECT cse.*
FROM #temp_sub cse
LEFT JOIN corp_endosso ce ON ce.id_sub = cse.id_sub
WHERE ce.id_sub IS NULL;
```

**Solução (DEPOIS):** Substituir por `NOT EXISTS`, que é mais eficiente e evita a duplicação.

```sql
-- Reescrevendo LEFT JOIN + IS NULL para NOT EXISTS
SELECT cse.*
FROM #temp_sub cse
WHERE NOT EXISTS (
    SELECT 1
    FROM corp_endosso ce
    WHERE ce.id_sub = cse.id_sub
);
```

**Motivo:** O `LEFT JOIN` gera todas as combinações entre as tabelas, incluindo aquelas com correspondência, e depois o `IS NULL` filtra as linhas que não tiveram correspondência. Isso pode gerar um grande volume de dados intermediários e processamento extra. O `NOT EXISTS` é uma *anti-semi-join*: ele verifica a existência de uma correspondência e para na primeira linha encontrada, descartando imediatamente os registros que têm correspondência e mantendo apenas os que não têm. Isso é muito mais eficiente, especialmente quando a tabela secundária é grande.

## Recomendação

- Sempre que encontrar um padrão `LEFT JOIN ... WHERE tabela2.coluna IS NULL`, substitua por `NOT EXISTS`.
- Verifique se há índices adequados na coluna de junção da tabela secundária (no exemplo, `ce.id_sub`). Se não houver, emita o handoff para `create_assertive_index`.
- Essa substituição também elimina a necessidade de `DISTINCT` em casos de múltiplas correspondências, pois o `NOT EXISTS` garante que cada linha da tabela principal seja retornada uma única vez.
- Se a consulta original também usava colunas da tabela joinada em outras partes (ex: no `SELECT` ou em outras condições), a substituição por `NOT EXISTS` não é aplicável – mantenha o `LEFT JOIN`.

---
**⚠️ Importante:** Esse padrão é muito comum e frequentemente negligenciado. A substituição por `NOT EXISTS` pode trazer ganhos significativos de performance, principalmente em tabelas com muitos dados e relacionamentos com alta cardinalidade.