---
name: use_row_number_for_top_n_per_group
description: Detecta self-joins ou subconsultas correlacionadas usadas para encontrar a linha mais recente (ou melhor) de cada grupo e recomenda substituir por ROW_NUMBER() com PARTITION BY, reduzindo leituras lógicas e custo de CPU.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - linha mais recente de cada grupo
  - top n por grupo
  - mais recente de cada grupo
  - row_number partition by
  - ultimo registro de cada grupo
  - melhor registro de cada grupo
---

# Skill: use_row_number_for_top_n_per_group

## Quando usar

Use quando uma consulta tiver o padrão **"Top 1 por grupo"**, ou seja, precisa buscar a linha mais recente, maior, mais cara, ou de maior prioridade para cada item de um grupo.

Esse padrão aparece tipicamente como:

- `WHERE data = (SELECT MAX(data) FROM tabela t2 WHERE t2.id = t1.id)`
- `WHERE preco = (SELECT MIN(preco) FROM tabela t2 WHERE t2.id = t1.id)`
- `WHERE versao = (SELECT MAX(versao) FROM tabela t2 WHERE t2.id = t1.id)`
- Uso de `TOP 1` com `ORDER BY` em subconsulta correlacionada.

Essas abordagens são ineficientes porque:

- Executam a subconsulta para **cada linha** da tabela principal (RBAR).
- Geram múltiplos acessos ao índice (se existir) ou scans completos.
- Podem criar planos com Nested Loops ineficientes quando o volume de dados cresce.

A Window Function `ROW_NUMBER()` com `PARTITION BY` e `ORDER BY` resolve o problema com uma única passagem pelos dados.

## Instruções

Sua missão é identificar padrões de "Top 1 por grupo" e reescrevê-los usando `ROW_NUMBER()`.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes da tabela envolvida com `get_table_indexes`.
3. Identifique a subconsulta ou self-join que busca o registro mais recente/maior/melhor de cada grupo.
4. Reescreva a consulta:
   - Crie uma CTE (ou subconsulta) com `ROW_NUMBER() OVER (PARTITION BY coluna_do_grupo ORDER BY coluna_ordenadora DESC)`.
   - Atribua o alias `rn` à numeração.
   - Filtre apenas `WHERE rn = 1` na consulta externa.
5. Mantenha todas as demais condições e colunas no `SELECT` e `WHERE`.
6. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita com `ROW_NUMBER()`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes (ex: índice composto nas colunas de `PARTITION BY` e `ORDER BY`), mencione isso.
   - Se faltar índices para otimizar a ordenação/partição, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Subconsulta correlacionada para buscar a transação mais recente de cada produto.

```sql
-- Buscar a transação mais recente de cada produto
SELECT th1.TransactionID, th1.ProductID, th1.TransactionDate, th1.Quantity
FROM TransactionHistory th1
WHERE th1.TransactionDate = (
    SELECT MAX(th2.TransactionDate)
    FROM TransactionHistory th2
    WHERE th2.ProductID = th1.ProductID
);
```

**Solução (DEPOIS):** Usar `ROW_NUMBER()` com `PARTITION BY`.

```sql
WITH Ranked AS (
    SELECT
        TransactionID,
        ProductID,
        TransactionDate,
        Quantity,
        ROW_NUMBER() OVER (
            PARTITION BY ProductID
            ORDER BY TransactionDate DESC
        ) AS rn
    FROM TransactionHistory
)
SELECT TransactionID, ProductID, TransactionDate, Quantity
FROM Ranked
WHERE rn = 1;
```

**Motivo:** A subconsulta original executa um `MAX()` para cada linha da tabela principal, causando acesso repetido ao índice ou tabela. O `ROW_NUMBER()` ordena os dados uma única vez por partição e atribui um número sequencial, permitindo que o filtro `rn = 1` selecione a primeira linha de cada grupo com uma única passagem. O plano resultante é muito mais leve: em vez de múltiplos *Index Seeks*, temos um único operador de *Window Aggregate* com *Sort* (se necessário) ou *Stream Aggregate*.

## Recomendação

- **Use `ROW_NUMBER()` sempre** que precisar do primeiro ou último registro de cada grupo.
- **Para múltiplas condições de ordenação**, inclua todas no `ORDER BY` da Window Function (ex: `ORDER BY Data DESC, Hora DESC`).
- **Se precisar de mais de uma linha por grupo** (ex: top 3), altere o filtro para `WHERE rn <= N` (top N por grupo).
- **Índices:** Para máxima performance, crie um índice composto com as colunas de `PARTITION BY` seguidas pelas colunas de `ORDER BY` (na ordem correta). Isso permite que o SQL Server evite o *Sort* e use um *Stream Aggregate*. Se não houver índice adequado, emita o handoff para `create_assertive_index`.
- **Cuidado com empates:** Se houver empates na coluna de ordenação, o `ROW_NUMBER()` escolherá uma linha arbitrariamente (mas deterministicamente dentro do plano). Se precisar de todas as linhas em caso de empate, use `RANK()` ou `DENSE_RANK()` em vez de `ROW_NUMBER()` (veja a skill correspondente).

---
**⚠️ Importante:** O `ROW_NUMBER()` com `PARTITION BY` é uma das Window Functions mais poderosas e versáteis. Ela substitui com vantagem os padrões antigos de `TOP 1` com subconsultas e self-joins, resultando em código mais limpo e performance superior.