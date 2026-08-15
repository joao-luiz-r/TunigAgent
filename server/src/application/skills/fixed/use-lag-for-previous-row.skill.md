---
name: use_lag_for_previous_row
description: Detecta self-joins ou subconsultas TOP 1 usadas para acessar o valor da linha anterior dentro de um grupo (ex: comparar pedidos consecutivos de um cliente) e recomenda substituir por LAG() com PARTITION BY, reduzindo drasticamente leituras lógicas e custo de CPU.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - lag()
  - linha anterior
  - previous row
  - comparar com a linha anterior
  - lag no lugar do self join
  - valor da linha anterior
---

# Skill: use_lag_for_previous_row

## Quando usar

Use quando uma consulta precisar acessar dados da **linha anterior** dentro de um grupo, como:

- Calcular a diferença de datas entre pedidos consecutivos de um mesmo cliente.
- Comparar o valor atual com o valor do registro anterior (ex: evolução de preço de um produto).
- Identificar se houve mudança de status entre etapas consecutivas de um processo.
- Obter o saldo anterior para calcular a variação.

O padrão ineficiente típico é:

- `LEFT JOIN` com a mesma tabela usando condições de data (ex: `soh_prev.OrderDate < soh.OrderDate` com `TOP 1` e `ORDER BY`).
- Subconsulta correlacionada com `TOP 1` e `ORDER BY` para buscar a linha imediatamente anterior.

Essas abordagens são lentas porque:

- Executam uma busca na tabela secundária para **cada linha** da consulta principal.
- Podem exigir múltiplas leituras do índice ou tabela.
- O plano de execução frequentemente mostra Nested Loops ineficientes.

A Window Function `LAG()` acessa a linha anterior em uma única passagem pelos dados, sem self-joins ou subconsultas.

## Instruções

Sua missão é identificar padrões de acesso à linha anterior e reescrevê-los usando `LAG()` com `PARTITION BY` e `ORDER BY`.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes da tabela envolvida com `get_table_indexes`.
3. Identifique o self-join ou subconsulta que busca a linha anterior dentro do grupo.
4. Reescreva a consulta:
   - Use `LAG(coluna_do_valor, 1) OVER (PARTITION BY coluna_do_grupo ORDER BY coluna_ordenadora)` para obter o valor anterior.
   - Se precisar de mais de uma linha anterior, ajuste o segundo parâmetro (ex: `LAG(coluna, 2)`).
   - Substitua a lógica do join/subconsulta pela Window Function.
5. Mantenha todas as demais condições e colunas.
6. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita com `LAG()`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes (ex: índice composto nas colunas de `PARTITION BY` e `ORDER BY`), mencione isso.
   - Se faltar índices para otimizar a ordenação/partição, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Self-join com `TOP 1` para buscar a linha anterior.

```sql
-- Calcular dias entre pedidos consecutivos de cada cliente
SELECT
    soh.SalesOrderID,
    soh.CustomerID,
    soh.OrderDate,
    DATEDIFF(DAY,
        (SELECT TOP 1 soh_prev.OrderDate
         FROM Sales.SalesOrderHeader soh_prev
         WHERE soh_prev.CustomerID = soh.CustomerID
           AND soh_prev.OrderDate < soh.OrderDate
         ORDER BY soh_prev.OrderDate DESC),
        soh.OrderDate
    ) AS DaysSincePreviousOrder
FROM Sales.SalesOrderHeader soh;
```

**Solução (DEPOIS):** Usar `LAG()` com `PARTITION BY`.

```sql
SELECT
    SalesOrderID,
    CustomerID,
    OrderDate,
    DATEDIFF(DAY,
        LAG(OrderDate) OVER (
            PARTITION BY CustomerID
            ORDER BY OrderDate
        ),
        OrderDate
    ) AS DaysSincePreviousOrder
FROM Sales.SalesOrderHeader;
```

**Motivo:** A subconsulta correlacionada executa um `TOP 1` com `ORDER BY` para cada linha, gerando acesso repetido ao índice. O `LAG()` faz uma única ordenação por partição e mantém o valor da linha anterior em memória durante a passagem, calculando a diferença sem novos acessos ao disco. O plano torna-se um único operador de *Window Aggregate* com *Sort* ou *Stream Aggregate*, muito mais leve.

## Recomendação

- **Use `LAG()` sempre** que precisar do valor da linha imediatamente anterior dentro de um grupo.
- **Para mais de uma linha anterior**, use `LAG(Coluna, N)` (ex: `LAG(OrderDate, 2)` para duas linhas atrás).
- **Use `LEAD()` para a linha seguinte** (veja skill correspondente `use_lead_for_next_row`).
- **Índices:** Para máxima performance, crie um índice composto com as colunas de `PARTITION BY` seguidas pelas colunas de `ORDER BY`. Isso permite que o SQL Server evite o *Sort* e use um *Stream Aggregate*. Se não houver índice adequado, emita o handoff para `create_assertive_index`.
- **Valor padrão para primeira linha:** Use o terceiro parâmetro para definir um valor padrão quando não há linha anterior (ex: `LAG(OrderDate, 1, '1900-01-01') OVER ...`).
- **Evite self-joins complexos:** A substituição por `LAG()` não apenas melhora a performance como também torna o código mais legível e fácil de manter.

---
**⚠️ Importante:** O `LAG()` e `LEAD()` estão disponíveis a partir do SQL Server 2012. Em versões anteriores, é necessário usar self-joins ou CTEs recursivas. Verifique a compatibilidade do ambiente antes de aplicar.