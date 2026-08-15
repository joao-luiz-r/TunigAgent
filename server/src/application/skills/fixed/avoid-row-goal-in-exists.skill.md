---
name: avoid_row_goal_in_exists
description: Detecta subconsultas EXISTS com TOP ou ORDER BY que induzem o otimizador ao viés de Row Goal, forçando Nested Loops ineficientes. Recomenda simplificar a subconsulta, removendo ordenações e limitações desnecessárias para permitir decisões de plano mais eficientes.
tools:
  - get_query_text
  - get_table_indexes
  - get_execution_plan
keywords:
  - row goal
  - exists com order by
  - row goal bias
  - exists com top
  - vies de row goal
  - subconsulta exists com ordenacao
---

# Skill: avoid_row_goal_in_exists

## Quando usar

Use quando uma consulta contiver uma subconsulta `EXISTS` (ou `IN`) que inclui:

- `TOP` (ex: `EXISTS (SELECT TOP 1 1 FROM ...)`)
- `ORDER BY` (ex: `EXISTS (SELECT 1 FROM ... ORDER BY ...)`)

Embora o otimizador do SQL Server tente transformar `EXISTS` e `IN` em *Semi-Joins*, a presença de `TOP` ou `ORDER BY` dentro da subconsulta pode ativar um viés chamado **Row Goal**. O otimizador assume que encontrará a primeira linha correspondente rapidamente e, com base nessa estimativa, opta por um operador **Nested Loops** que pode ser extremamente ineficiente quando a tabela secundária tem muitos registros por chave. O resultado é um plano que executa buscas repetidas e lentas, em vez de um *Hash Match* ou *Merge Join* mais adequado para grandes volumes.

## Instruções

Sua missão é identificar subconsultas `EXISTS` (ou `IN`) com `TOP` ou `ORDER BY` e reescrevê-las na forma mais simples e pura, removendo ordenações e limitações desnecessárias.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Analise a subconsulta:
   - Localize `EXISTS (SELECT ...)` ou `IN (SELECT ...)`.
   - Verifique se há `TOP`, `ORDER BY`, `DISTINCT` ou outras cláusulas que não são essenciais para a lógica de existência.
   - Confirme que a subconsulta é usada apenas para verificar a existência de registros, e não para retornar um valor específico ou ordenado.
4. Reescreva a subconsulta:
   - Remova `TOP` (a menos que seja logicamente necessário, o que raramente é o caso em `EXISTS`).
   - Remova `ORDER BY` (a ordenação não tem efeito na verificação de existência).
   - Simplifique o `SELECT` para apenas `1` ou `*` (ex: `SELECT 1 FROM ...`).
   - Mantenha a condição de junção na subconsulta.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da simplificação da subconsulta para eliminar o viés de Row Goal. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes, mencione isso.
   - Se faltar índices para as colunas de junção, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Subconsulta EXISTS com TOP e ORDER BY, confundindo o otimizador com Row Goal.

```sql
-- Exemplo extraído do PDF: Busca pedidos que tenham itens,
-- mas com TOP e ORDER BY dentro do EXISTS
SELECT *
FROM Pedidos p
WHERE EXISTS (
    SELECT TOP 1 *
    FROM Itens i
    WHERE i.PedidoId = p.Id
    ORDER BY i.DataCriacao DESC
);
```

**Solução (DEPOIS):** Simplificar a subconsulta, removendo TOP e ORDER BY.

```sql
SELECT *
FROM Pedidos p
WHERE EXISTS (
    SELECT 1
    FROM Itens i
    WHERE i.PedidoId = p.Id
);
```

**Motivo:** O `EXISTS` só precisa saber se existe **pelo menos uma** linha correspondente. Não importa qual linha é retornada, nem a ordem. Ao incluir `TOP` e `ORDER BY`, o otimizador ativa o *Row Goal*: ele estima que encontrará a primeira linha correspondente rapidamente (geralmente após poucas leituras) e escolhe um operador **Nested Loops** para buscar as linhas uma a uma. Quando a tabela `Itens` tem muitos registros por `PedidoId`, esse Nested Loops pode se tornar extremamente lento, pois o otimizador subestimou o custo. Ao remover `TOP` e `ORDER BY`, o otimizador trata a subconsulta como uma semi-join pura, podendo escolher operadores mais eficientes como **Hash Match** ou **Merge Join**, que são muito mais adequados para grandes volumes.

## Recomendação

- **Sempre** que usar `EXISTS` ou `IN`, mantenha a subconsulta o mais simples possível:
  - Use `SELECT 1` ou `SELECT *` (sem `TOP`).
  - Evite `ORDER BY` (não faz sentido em uma verificação de existência).
  - Evite `DISTINCT` (já que a existência não se importa com duplicatas).
- Se você realmente precisa verificar a existência de uma linha específica (por exemplo, a mais recente), considere usar um `JOIN` com uma subconsulta derivada que traga essa linha, em vez de colocá-la dentro do `EXISTS`.
- Verifique os índices na coluna de junção (ex: `Itens.PedidoId`). Se não houver um índice eficiente, emita o handoff para `create_assertive_index` para avaliar a criação.

---
**⚠️ Importante:** O viés de Row Goal pode ser difícil de diagnosticar sem analisar o plano de execução. Se você suspeitar que um `EXISTS` está gerando Nested Loops ineficientes, simplifique a subconsulta e reavalie o plano. Essa simplificação não altera a lógica e frequentemente traz ganhos significativos de performance.