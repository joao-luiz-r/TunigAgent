---
name: use_lead_for_next_row
description: Detecta self-joins ou subconsultas correlacionadas usadas para acessar o valor de uma linha seguinte dentro do mesmo grupo (ex: prever próximo status ou data) e recomenda substituir por LEAD(), eliminando a necessidade de múltiplos acessos e reduzindo drasticamente o custo de leitura e CPU.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - lead()
  - proxima linha
  - next row
  - linha seguinte
  - lead no lugar do self join
  - valor da proxima linha
---

# Skill: use_lead_for_next_row

## Quando usar

Use quando uma consulta precisar acessar o valor de uma **linha seguinte** dentro de um grupo ordenado, como por exemplo:

- Prever o próximo status de um pedido com base no status atual.
- Calcular a diferença de dias entre a data atual e a próxima data de um mesmo cliente.
- Identificar se haverá uma mudança de preço na próxima venda.
- Calcular o intervalo entre eventos consecutivos.

O padrão clássico (e ineficiente) para resolver isso é:

- Self-join com condição de desigualdade e `TOP 1` para buscar a próxima linha.
- Subconsulta correlacionada com `MIN(data)` e `data > data_atual`.
- Uso de cursores ou loops para processar linha a linha.

Essas abordagens são caras porque:

- O self-join pode gerar um produto cartesiano filtrado, com múltiplas leituras da mesma tabela.
- A subconsulta correlacionada executa uma busca para cada linha da tabela principal (RBAR).
- Cursores são lentos e consomem recursos desnecessários.

A Window Function `LEAD()` resolve o problema com uma única passagem pelos dados, acessando diretamente a próxima linha sem a necessidade de joins ou subconsultas.

## Instruções

Sua missão é identificar padrões de acesso à linha seguinte e reescrevê-los usando `LEAD()`.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Identifique onde a consulta precisa do valor de uma linha seguinte dentro de um grupo (ex: `WHERE data > data_atual ORDER BY data ASC LIMIT 1`).
4. Reescreva a consulta:
   - Utilize `LEAD(coluna_desejada, 1)` ou `LEAD(coluna_desejada, N)` para acessar a N-ésima linha seguinte.
   - Use `PARTITION BY` para definir o grupo (ex: cliente, produto, funcionário).
   - Use `ORDER BY` para definir a ordenação dentro do grupo (ex: por data, por versão).
   - Se precisar do valor em uma coluna calculada (ex: diferença entre datas), use o `LEAD()` diretamente na expressão.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita com `LEAD()`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes (ex: índice composto nas colunas de `PARTITION BY` e `ORDER BY`), mencione isso.
   - Se faltar índices para otimizar a ordenação/partição, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Self-join complexo para calcular dias até o próximo pedido de cada cliente.

```sql
-- Calcular dias até o próximo pedido de cada cliente
SELECT
    s1.SalesOrderID,
    s1.CustomerID,
    s1.OrderDate,
    DATEDIFF(DAY,
        s1.OrderDate,
        (SELECT TOP 1 s2.OrderDate
         FROM Sales.SalesOrderHeader s2
         WHERE s2.CustomerID = s1.CustomerID
           AND s2.OrderDate > s1.OrderDate
         ORDER BY s2.OrderDate ASC)
    ) AS DaysUntilNextOrder
FROM Sales.SalesOrderHeader s1;
```

**Solução (DEPOIS):** Usar `LEAD()` com `PARTITION BY` e `ORDER BY`.

```sql
SELECT
    SalesOrderID,
    CustomerID,
    OrderDate,
    DATEDIFF(DAY,
        OrderDate,
        LEAD(OrderDate) OVER (
            PARTITION BY CustomerID
            ORDER BY OrderDate
        )
    ) AS DaysUntilNextOrder
FROM Sales.SalesOrderHeader;
```

**Motivo:** A abordagem original usa uma subconsulta com `TOP 1` e `ORDER BY` para cada linha da tabela principal. Isso gera um plano com **Nested Loops** e múltiplos *Index Seeks* (ou *Scans*) para cada linha, resultando em alto custo de I/O e CPU. O `LEAD()` faz uma única passagem pelos dados ordenados, mantendo em memória o valor da próxima linha e disponibilizando-o diretamente para a linha atual, sem joins ou subconsultas. O plano fica muito mais simples: um *Window Aggregate* com *Sort* (se necessário) ou *Stream Aggregate*, com custo linear (O(n)) em vez de quadrático (O(n²)).

## Recomendação

- **Use `LEAD()` sempre** que precisar acessar dados de linhas seguintes dentro do mesmo grupo.
- **Defina a ordenação correta:** o `ORDER BY` dentro do `OVER()` deve refletir a ordem em que você quer considerar as linhas seguintes (ex: ordem cronológica).
- **Para múltiplos deslocamentos:** `LEAD(coluna, 2)` para duas linhas à frente, e assim por diante.
- **Tratamento de NULL:** `LEAD()` retorna `NULL` para a última linha de cada partição. Use `ISNULL()` ou `COALESCE()` se quiser um valor padrão (ex: `ISNULL(LEAD(OrderDate) OVER (...), OrderDate)` para usar a própria data quando não houver próxima).
- **Índices:** Para máxima performance, crie um índice composto com as colunas de `PARTITION BY` seguidas pelas colunas de `ORDER BY`. Isso permite que o SQL Server evite o *Sort* e use um *Stream Aggregate*. Se não houver índice adequado, emita o handoff para `create_assertive_index`.
- **Alternativa `LAG()`:** Se precisar da linha anterior em vez da seguinte, use `LAG()` (veja a skill correspondente).

---
**⚠️ Importante:** `LEAD()` é a contrapartida natural de `LAG()` e é igualmente poderosa para eliminar self-joins e subconsultas. Juntas, elas cobrem praticamente todos os cenários de acesso a linhas adjacentes em séries temporais ou sequenciais.