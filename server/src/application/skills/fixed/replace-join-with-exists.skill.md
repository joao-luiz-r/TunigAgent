---
name: replace_join_with_exists
description: Detecta JOINs que são usados apenas para filtrar registros (sem trazer colunas da tabela joinada) e os reescreve como EXISTS para melhorar a performance, evitando processamento desnecessário e permitindo que o otimizador use semi-joins.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - join so para filtrar
  - join apenas para filtrar
  - join que gera duplicatas
  - usar exists no lugar do join
  - join para filtro
  - substituir join por exists
---

# Skill: replace_join_with_exists

## Quando usar

Use quando uma consulta utiliza um `JOIN` com uma tabela apenas para verificar a existência de registros que atendem a uma condição, **sem** selecionar colunas dessa tabela. Nesse cenário, o `JOIN` pode gerar duplicatas (se houver múltiplas correspondências) e processar mais linhas do que o necessário. Substituir por `EXISTS` transforma a lógica em uma *semi-join*, que é mais eficiente, pois para na primeira correspondência e evita duplicações.

Exemplos típicos:

- `FROM tabela1 JOIN tabela2 ON tabela1.id = tabela2.fk_id WHERE ...` (sem colunas de tabela2 no SELECT)
- `FROM tabela1 INNER JOIN tabela2 ON ...` usado apenas para filtrar

Nesses casos, o `EXISTS` costuma ser mais performático, especialmente quando a tabela joinada tem muitas linhas por chave.

**⚠️ COMO ESCOLHER A VARIAÇÃO CERTA (não confunda as três skills de EXISTS):**

- `JOIN` **com** `DISTINCT`/`GROUP BY` só para listar registros que têm correspondência → use `[SKILL_HANDOFF:replace_join_distinct_with_exists]` (o `DISTINCT` força Sort caro).
- `LEFT JOIN ... WHERE coluna IS NULL` (anti-join, registros sem correspondência) → use `[SKILL_HANDOFF:replace_left_join_isnull_with_not_exists]` (`NOT EXISTS`).
- **Somente `JOIN` puro** usado apenas para filtrar, sem `DISTINCT` e sem `IS NULL` → é esta skill (`replace_join_with_exists`).

## Instruções

Sua missão é identificar `JOINs` que podem ser substituídos por `EXISTS` (ou `NOT EXISTS` para anti-joins) e reescrever a consulta de forma a manter o mesmo resultado, melhorando a performance.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Analise a consulta:
   - Verifique se a tabela joinada **não** tem colunas no `SELECT`, no `WHERE` (além da condição de junção) ou em outras cláusulas (como `GROUP BY`, `ORDER BY`).
   - Confirme que o `JOIN` é usado exclusivamente para filtrar linhas da tabela principal.
4. Reescreva o `JOIN` utilizando `EXISTS` (ou `NOT EXISTS`) com uma subconsulta correlacionada.
   - Mantenha todas as outras cláusulas (`WHERE`, `GROUP BY`, etc.) inalteradas.
   - Se houver múltiplos `JOINs` desse tipo, considere substituir cada um por `EXISTS` separadamente.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita do `JOIN` para `EXISTS`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes, mencione isso.
   - Se faltar índices para a subconsulta, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Uso de `JOIN` apenas para filtrar, podendo gerar duplicatas e processamento extra.

```sql
-- Exemplo extraído do PDF: Consulta com JOINS, onde a tabela corp_endosso_item_vida
-- é usada apenas para verificar a existência de itens de vida para cada endosso.
SELECT cse.*
FROM #temp_sub cse
JOIN corp_endosso ce ON ce.id_sub = cse.id_sub
JOIN corp_apolice ca ON ca.id_apolice = cse.id_apolice
LEFT JOIN corp_modulo cmod ON cmod.nm_modulo = 'Emissão'
JOIN corp_endosso_item_vida ceiv ON ceiv.id_endosso = ce.id_endosso;
```

**Solução (DEPOIS):** Substituir o `JOIN` por `EXISTS`, eliminando possíveis duplicatas e melhorando a performance.

```sql
-- Reescrevendo o JOIN para EXISTS
SELECT cse.*
FROM #temp_sub cse
JOIN corp_endosso ce ON ce.id_sub = cse.id_sub
JOIN corp_apolice ca ON ca.id_apolice = cse.id_apolice
LEFT JOIN corp_modulo cmod ON cmod.nm_modulo = 'Emissão'
WHERE EXISTS (
    SELECT 1
    FROM corp_endosso_item_vida ceiv
    WHERE ceiv.id_endosso = ce.id_endosso
);
```

**Motivo:** O `EXISTS` é uma *semi-join*: ele verifica a existência de pelo menos uma linha na tabela joinada que atenda à condição, sem multiplicar as linhas da tabela principal. Isso é mais eficiente que um `INNER JOIN` quando não há necessidade de trazer colunas da tabela secundária, pois evita a duplicação de resultados e reduz o processamento. Além disso, o otimizador pode escolher estratégias como *semi-join* ou *anti-semi-join* que frequentemente são mais rápidas.

## Recomendação

- Avalie se a tabela joinada é usada apenas para filtrar. Se sim, substitua por `EXISTS` (ou `NOT EXISTS`).
- Se a tabela joinada também for usada no `SELECT` ou em outras condições, mantenha o `JOIN`.
- Verifique se há índices adequados nas colunas da condição da subconsulta (no exemplo, `ceiv.id_endosso`). Se não houver, emita o handoff para `create_assertive_index`.
- Para `LEFT JOIN` com `IS NULL` (anti-join), utilize `NOT EXISTS` no lugar.

---
**⚠️ Importante:** A substituição é especialmente benéfica quando a tabela joinada tem muitas linhas por chave estrangeira, pois o `JOIN` geraria um grande conjunto de resultados intermediários, enquanto o `EXISTS` para na primeira correspondência.