---
name: use_sum_over_for_running_total
description: Detecta subconsultas correlacionadas com SUM() ou self-joins usados para calcular totais acumulados (running totals) e recomenda substituir por SUM() OVER (ORDER BY ... ROWS UNBOUNDED PRECEDING), eliminando a necessidade de múltiplas agregações por linha e reduzindo drasticamente o custo de CPU e I/O.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - running total
  - total acumulado
  - sum() over
  - soma acumulada
  - total progressivo
  - acumulando somatoria
---

# Skill: use_sum_over_for_running_total

## Quando usar

Use quando uma consulta precisar calcular um **total acumulado** (running total, saldo corrente, soma cumulativa) que depende da ordenação dos dados, como por exemplo:

- Saldo acumulado de uma conta bancária por data de transação.
- Vendas acumuladas por mês para um determinado produto.
- Estoque acumulado por data de entrada/saída.
- Soma progressiva de horas trabalhadas por funcionário.

O padrão clássico (e ineficiente) para resolver isso é:

- Subconsulta correlacionada com `SUM()` e condição `data <= data_atual`.
- Self-join com agregação por grupo e condição de ordenação.
- Uso de cursores ou variáveis locais (`SET @total = @total + valor`).

Essas abordagens são caras porque:

- A subconsulta correlacionada executa uma agregação completa para cada linha (complexidade O(n²)).
- O self-join gera um produto cartesiano filtrado, com múltiplas leituras da mesma tabela.
- Cursores com variáveis são linha a linha e não aproveitam operações em conjunto.
- O uso do `RANGE` padrão no `SUM() OVER` pode causar spills de memória.

A Window Function `SUM() OVER (ORDER BY ... ROWS UNBOUNDED PRECEDING)` resolve o problema com uma única passagem pelos dados, acumulando valores de forma eficiente e com complexidade linear (O(n)).

## Instruções

Sua missão é identificar padrões de running total e reescrevê-los usando `SUM() OVER` com `ROWS UNBOUNDED PRECEDING`.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes da tabela envolvida com `get_table_indexes`.
3. Identifique onde a consulta calcula um total acumulado, tipicamente com:
   - Subconsulta no `SELECT` com `SUM()` e condição `<=` ou `<`.
   - Self-join com `SUM()` e `GROUP BY` na tabela principal.
4. Reescreva a consulta:
   - Utilize `SUM(coluna) OVER (PARTITION BY coluna_de_agrupamento ORDER BY coluna_ordenadora ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`.
   - `PARTITION BY` é opcional – use se o running total for por grupo (ex: por cliente).
   - `ORDER BY` define a ordem do acúmulo (ex: por data).
   - **Obrigatório:** use `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` em vez do `RANGE` padrão para evitar spills e garantir performance.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita com `SUM() OVER`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes (ex: índice composto nas colunas de `PARTITION BY` e `ORDER BY`), mencione isso.
   - Se faltar índices para otimizar a ordenação/partição, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Subconsulta correlacionada para calcular total acumulado por cliente.

```sql
-- Total acumulado de vendas por cliente
SELECT
    s1.SalesOrderID,
    s1.CustomerID,
    s1.OrderDate,
    s1.TotalDue,
    (SELECT SUM(s2.TotalDue)
     FROM Sales.SalesOrderHeader s2
     WHERE s2.CustomerID = s1.CustomerID
       AND s2.OrderDate <= s1.OrderDate) AS RunningTotal
FROM Sales.SalesOrderHeader s1
ORDER BY s1.CustomerID, s1.OrderDate;
```

**Solução (DEPOIS):** Usar `SUM() OVER` com `ROWS UNBOUNDED PRECEDING`.

```sql
SELECT
    SalesOrderID,
    CustomerID,
    OrderDate,
    TotalDue,
    SUM(TotalDue) OVER (
        PARTITION BY CustomerID
        ORDER BY OrderDate
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS RunningTotal
FROM Sales.SalesOrderHeader
ORDER BY CustomerID, OrderDate;
```

**Motivo:** A subconsulta correlacionada calcula o `SUM` para cada linha, percorrendo todas as linhas anteriores a cada iteração – custo O(n²). O `SUM() OVER` com `ROWS UNBOUNDED PRECEDING` faz uma única passagem pelos dados, acumulando o total em um operador de *Window Aggregate* com complexidade O(n). Além disso, o uso explícito de `ROWS` em vez de `RANGE` evita que o SQL Server precise considerar valores iguais na ordenação como um grupo, o que pode causar *spills* de memória e perda de performance.

## Recomendação

- **Sempre** use `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` para running totals. **Nunca** use o padrão `RANGE` (que é equivalente a `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`) – este tem penalidade de performance significativa.
- **Particione se necessário:** Use `PARTITION BY` para reiniciar o total por grupo (ex: por cliente, produto, departamento). Se não usar, o total será global.
- **Defina a ordenação correta:** O `ORDER BY` deve refletir a sequência lógica do acúmulo (ex: data, sequência numérica).
- **Para janelas móveis (ex: soma dos últimos 7 dias):** use `ROWS BETWEEN 6 PRECEDING AND CURRENT ROW` (veja a skill específica para janelas deslizantes).
- **Índices:** Para máxima performance, crie um índice composto com as colunas de `PARTITION BY` seguidas pelas colunas de `ORDER BY`. Isso permite que o SQL Server evite o *Sort* e use um *Stream Aggregate*. Se não houver índice adequado, emita o handoff para `create_assertive_index`.
- **Monitore memory grants:** `SUM() OVER` com `ORDER BY` pode exigir um *memory grant* para armazenar os dados ordenados. Em volumes muito grandes, monitore spills no `tempdb`.

---
**⚠️ Importante:** A diferença entre `ROWS` e `RANGE` em `OVER()` é sutil, mas crucial. `RANGE` agrupa valores iguais na ordenação, o que pode causar processamento extra e maior consumo de memória. `ROWS` é mais eficiente e previsível. Sempre prefira `ROWS` para running totals.