---
name: use_apply_for_multiple_aggregates
description: Detecta múltiplas subconsultas correlacionadas no SELECT que calculam diferentes agregados (SUM, COUNT, AVG, MIN, MAX) sobre a mesma tabela secundária para cada linha da tabela principal, e recomenda substituir por um único OUTER APPLY (ou CROSS APPLY) que calcula todos os agregados em uma única passagem, eliminando execuções repetidas e melhorando performance e legibilidade.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - multiple aggregates
  - varios agregados
  - outer apply
  - um apply para agregados
  - varios agregados na mesma tabela
  - um outer apply com agregados
---

# Skill: use_apply_for_multiple_aggregates

## Quando usar

Use quando uma consulta precisar calcular **vários agregados** (como `SUM`, `COUNT`, `AVG`, `MIN`, `MAX`) sobre uma tabela secundária para **cada linha** da tabela principal, e estiver usando múltiplas subconsultas correlacionadas no `SELECT`.

Exemplo típico:

```sql
SELECT
    CustomerID,
    (SELECT SUM(TotalAmount) FROM Orders WHERE Orders.CustomerID = Customers.CustomerID) AS TotalSales,
    (SELECT COUNT(OrderID) FROM Orders WHERE Orders.CustomerID = Customers.CustomerID) AS OrderCount
FROM Customers;
```

Nesse padrão:

- Cada subconsulta executa uma varredura ou busca separada na tabela `Orders` para cada cliente.
- Se houver 3 agregados, a tabela `Orders` é acessada **3 vezes por cliente**.
- Isso gera custo multiplicado (`O(n * m * agregados)`) e degrada a performance em grandes volumes.

A solução é usar **`OUTER APPLY`** (ou `CROSS APPLY`) com uma subconsulta que calcula **todos os agregados em uma única passagem**, retornando uma "tabela derivada" com todas as métricas para cada linha da tabela principal.

**Diferença entre CROSS APPLY e OUTER APPLY:**

| Tipo | Comportamento | Quando usar |
|------|---------------|-------------|
| `CROSS APPLY` | Retorna apenas linhas onde a subconsulta retorna dados | Quando todos os clientes têm pedidos (ou quando você quer apenas os que têm) |
| `OUTER APPLY` | Retorna todas as linhas da tabela principal, com `NULL` quando a subconsulta não retorna dados | Quando clientes podem não ter pedidos e você quer mantê-los (com `NULL`) |

## Instruções

Sua missão é identificar múltiplas subconsultas agregadas no `SELECT` e reescrevê-las usando `APPLY`.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Identifique as subconsultas que calculam agregados sobre a **mesma** tabela secundária, com a **mesma** condição de junção (ex: `WHERE Orders.CustomerID = Customers.CustomerID`).
4. Reescreva a consulta:
   - Substitua as subconsultas por um único `OUTER APPLY` (ou `CROSS APPLY`) com uma subconsulta que retorna todos os agregados desejados (`SUM`, `COUNT`, `AVG`, `MIN`, `MAX`, etc.) em uma única linha.
   - No `SELECT`, use os aliases definidos no `APPLY` para acessar os valores.
   - Se a lógica exigir que apenas clientes com dados sejam retornados, use `CROSS APPLY`; caso contrário, use `OUTER APPLY`.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita com `APPLY`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes (ex: índice na coluna de junção `CustomerID` em `Orders`), mencione isso.
   - Se faltar índices para otimizar a agregação, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Múltiplas subconsultas para SUM e COUNT, executadas repetidamente.

```sql
-- Exemplo extraído do arquivo: múltiplas subconsultas para cada cliente
SELECT
    CustomerID,
    (SELECT SUM(TotalAmount)
     FROM Orders
     WHERE Orders.CustomerID = Customers.CustomerID) AS TotalSales,
    (SELECT COUNT(OrderID)
     FROM Orders
     WHERE Orders.CustomerID = Customers.CustomerID) AS OrderCount
FROM Customers;
```

**Solução (DEPOIS):** Usar `OUTER APPLY` com todos os agregados em uma única subconsulta.

```sql
SELECT
    Customers.CustomerID,
    Sales.TotalSales,
    Sales.OrderCount
FROM Customers
OUTER APPLY (
    SELECT
        SUM(TotalAmount) AS TotalSales,
        COUNT(OrderID) AS OrderCount
    FROM Orders
    WHERE Orders.CustomerID = Customers.CustomerID
) AS Sales;
```

**Motivo:** A versão original executa **duas subconsultas independentes** para cada cliente – uma para `SUM` e outra para `COUNT`. Cada subconsulta varre ou busca a tabela `Orders` separadamente, resultando em duas vezes o custo de I/O e CPU. O `OUTER APPLY` executa **uma única consulta** na tabela `Orders`, calculando ambos os agregados em uma só passagem, e retorna os valores como uma tupla. O ganho é ainda maior quando há mais agregados (ex: `SUM`, `COUNT`, `AVG`, `MIN`, `MAX`): em vez de N subconsultas, temos apenas uma.

**Comparação de custo:**

- `Orders` com 1.000.000 linhas, `Customers` com 10.000 clientes.
- Original (2 subconsultas): ~20.000 buscas (2 por cliente), cada uma varrendo as linhas do cliente.
- Com `APPLY` (1 subconsulta): ~10.000 buscas (1 por cliente), com ambos os agregados calculados em uma só passagem.

**⚠️ NÃO confunda com `use_aggregate_over_partition`:** o `APPLY` é indicado quando os agregados vêm de **outra tabela secundária** (detalhe de `Customers`, agregados de `Orders`). A Window Function `OVER (PARTITION BY ...)` (skill `use_aggregate_over_partition`) é a melhor escolha quando o agregado é calculado **sobre o mesmo conjunto de linhas do resultado** (ex: total por cliente na própria tabela de vendas, sem join com outra fonte). Se a subconsulta agrega uma tabela distinta por linha, use `APPLY`; se agrega a própria tabela do detalhe, use `OVER (PARTITION BY ...)`.

## Recomendação

- **Use `OUTER APPLY`** quando você precisa de todos os agregados para cada linha da tabela principal, mesmo quando não há dados na tabela secundária (os agregados retornarão `NULL`).
- **Use `CROSS APPLY`** quando você quer apenas as linhas da tabela principal que têm pelo menos um registro na tabela secundária (funciona como um `INNER JOIN`).
- **Quando usar `APPLY` vs `JOIN` com `GROUP BY`:**
  - `JOIN` com `GROUP BY` agrupa todas as linhas de uma vez, mas pode ser menos eficiente se você também precisar de colunas da tabela principal com detalhes.
  - `APPLY` é mais direto quando você está apenas adicionando métricas calculadas por linha, sem alterar a cardinalidade da tabela principal.
- **Índices:** Certifique-se de que a coluna de junção (ex: `Orders.CustomerID`) tenha um índice. Se não houver, emita o handoff para `create_assertive_index`. Um índice nessa coluna permite que o `APPLY` faça buscas rápidas (Index Seek) para cada cliente, em vez de varreduras completas.
- **Legibilidade:** `APPLY` centraliza toda a lógica de agregação em um único local, tornando o código mais limpo e fácil de manter do que múltiplas subconsultas espalhadas.

---
**⚠️ Importante:** O `APPLY` (especialmente `OUTER APPLY`) é uma ferramenta versátil que vai além de agregados. Ele pode ser usado para calcular colunas complexas, chamar funções com parâmetros da linha atual e muito mais. Para o caso específico de múltiplas subconsultas agregadas, ele é a solução ideal e frequentemente negligenciada.