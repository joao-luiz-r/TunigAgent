---
name: use_rank_functions_for_numbering
description: Detecta uso de variáveis locais, subconsultas com COUNT ou lógica manual para numerar ou ranquear linhas dentro de grupos e recomenda substituir por ROW_NUMBER(), RANK() ou DENSE_RANK(), eliminando processamento iterativo e melhorando a performance com operações baseadas em conjunto.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - row_number()
  - dense_rank()
  - rank()
  - numeracao manual
  - ranquear linhas
  - numerar linhas
  - funcoes de rank
---

# Skill: use_rank_functions_for_numbering

## Quando usar

Use quando uma consulta precisar **numerar ou ranquear** linhas dentro de um grupo, como por exemplo:

- Atribuir um número sequencial para cada pedido de um cliente (ex: 1º pedido, 2º pedido, ...).
- Ranquear produtos por preço dentro de cada categoria.
- Numerar linhas para paginação (ex: resultados 1-50, 51-100, ...).
- Atribuir posição em uma competição (1º lugar, 2º lugar, etc.), lidando com empates de forma adequada.

Os padrões clássicos (e ineficientes) para resolver isso são:

- Uso de variáveis locais com `SET @rownum = @rownum + 1` dentro de um loop ou cursor.
- Subconsultas com `COUNT(*)` para contar quantas linhas têm valor menor/igual (ex: `(SELECT COUNT(*) FROM tabela t2 WHERE t2.grupo = t1.grupo AND t2.valor <= t1.valor)`).
- Self-joins com contagem de linhas anteriores.
- Uso de `IDENTITY` em tabelas temporárias para gerar números sequenciais.

Essas abordagens são caras porque:

- Variáveis locais e cursores processam linha a linha (RBAR), com alto overhead.
- Subconsultas com `COUNT` executam uma agregação para cada linha da tabela principal (custo O(n²)).
- Self-joins podem gerar produtos cartesianos filtrados, com múltiplas leituras da mesma tabela.
- Tabelas temporárias com `IDENTITY` exigem criação e carga adicional.

As Window Functions `ROW_NUMBER()`, `RANK()` e `DENSE_RANK()` resolvem o problema com **uma única passagem** pelos dados, de forma eficiente e com código mais limpo.

**Diferenças entre as funções:**

| Função | Comportamento | Exemplo com notas [10, 10, 9, 8] |
|--------|---------------|----------------------------------|
| `ROW_NUMBER()` | Número sequencial único, sem empates | 1, 2, 3, 4 |
| `RANK()` | Empates pulam posições | 1, 1, 3, 4 |
| `DENSE_RANK()` | Empates não pulam posições | 1, 1, 2, 3 |

## Instruções

Sua missão é identificar padrões manuais de numeração/rank e reescrevê-los usando a função de rank apropriada.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Identifique o padrão atual:
   - **Numeração sequencial simples (sem grupos):** pode ser substituída por `ROW_NUMBER() OVER (ORDER BY ...)`.
   - **Numeração dentro de grupos:** pode ser substituída por `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)`.
   - **Ranking com empates (pulando posições):** use `RANK()`.
   - **Ranking com empates (sem pular posições):** use `DENSE_RANK()`.
4. Reescreva a consulta:
   - Substitua a lógica manual pela Window Function apropriada.
   - Use `PARTITION BY` para reiniciar a numeração em cada grupo.
   - Use `ORDER BY` para definir a ordem da numeração/ranking.
   - Se precisar do número em uma condição de filtro (ex: `WHERE rn BETWEEN 51 AND 100`), use uma CTE ou subconsulta.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita com funções de rank. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes (ex: índice composto nas colunas de `PARTITION BY` e `ORDER BY`), mencione isso.
   - Se faltar índices para otimizar a ordenação/partição, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

### Caso 1: Numeração com variáveis locais

**Problema (ANTES):** Uso de variável local para numerar linhas (lento e propenso a erros).

```sql
-- Numeração manual com variável local (funciona, mas é ineficiente e não recomendado)
DECLARE @rownum INT = 0;

SELECT
    @rownum = @rownum + 1 AS RowNum,
    ProductID,
    Name,
    ListPrice
FROM Production.Product
ORDER BY ListPrice DESC;
```

**Solução (DEPOIS):** Usar `ROW_NUMBER()`.

```sql
SELECT
    ROW_NUMBER() OVER (ORDER BY ListPrice DESC) AS RowNum,
    ProductID,
    Name,
    ListPrice
FROM Production.Product
ORDER BY ListPrice DESC;
```

**Motivo:** A abordagem com variável local depende de ordem de avaliação não garantida (pode falhar em versões mais recentes ou com paralelismo) e é ineficiente. O `ROW_NUMBER()` é a forma correta e performática de numerar linhas.

---

### Caso 2: Ranking com empates

**Problema (ANTES):** Subconsulta para contar quantos produtos têm preço maior/igual, simulando rank.

```sql
-- Ranking manual com subconsulta COUNT (lento para grandes volumes)
SELECT
    p1.ProductID,
    p1.Name,
    p1.ListPrice,
    (SELECT COUNT(*) + 1
     FROM Production.Product p2
     WHERE p2.ListPrice > p1.ListPrice) AS RankPos
FROM Production.Product p1
ORDER BY ListPrice DESC;
```

**Solução (DEPOIS):** Usar `RANK()` ou `DENSE_RANK()`.

```sql
-- Com RANK() (empates pulam posições)
SELECT
    ProductID,
    Name,
    ListPrice,
    RANK() OVER (ORDER BY ListPrice DESC) AS RankPos
FROM Production.Product
ORDER BY ListPrice DESC;

-- Com DENSE_RANK() (empates não pulam posições)
SELECT
    ProductID,
    Name,
    ListPrice,
    DENSE_RANK() OVER (ORDER BY ListPrice DESC) AS RankPos
FROM Production.Product
ORDER BY ListPrice DESC;
```

**Motivo:** A subconsulta com `COUNT(*)` executa uma contagem para cada linha da tabela, resultando em custo O(n²). O `RANK()` ou `DENSE_RANK()` faz uma única passagem pelos dados, calculando a posição de cada linha de forma eficiente, com custo O(n log n) devido à ordenação (ou O(n) se houver índice adequado).

---

### Caso 3: Numeração por grupo

**Problema (ANTES):** Numeração manual com variáveis e `PARTITION BY` simulada.

```sql
-- Numeração manual por categoria com variáveis (complexo e propenso a erros)
DECLARE @CategoryID INT = 0, @RowNum INT = 0;

SELECT
    ProductID,
    Name,
    ProductCategoryID,
    ListPrice,
    CASE
        WHEN @CategoryID = ProductCategoryID THEN @RowNum := @RowNum + 1
        ELSE @RowNum := 1
    END AS RowNum,
    @CategoryID := ProductCategoryID AS Dummy
FROM Production.Product
ORDER BY ProductCategoryID, ListPrice DESC;
```

**Solução (DEPOIS):** Usar `ROW_NUMBER() OVER (PARTITION BY ...)`.

```sql
SELECT
    ProductID,
    Name,
    ProductCategoryID,
    ListPrice,
    ROW_NUMBER() OVER (PARTITION BY ProductCategoryID ORDER BY ListPrice DESC) AS RowNum
FROM Production.Product
ORDER BY ProductCategoryID, ListPrice DESC;
```

**Motivo:** A abordagem com variáveis é extremamente complexa, difícil de manter e pode falhar com planos paralelos. O `ROW_NUMBER() OVER (PARTITION BY ...)` é a forma correta, simples e performática de numerar dentro de grupos.

## Recomendação

- **Use `ROW_NUMBER()` para numeração sequencial única** (sem empates ou com empates arbitrários).
- **Use `RANK()` quando empates devem pular posições** (ex: competição, 1º, 1º, 3º).
- **Use `DENSE_RANK()` quando empates NÃO devem pular posições** (ex: 1º, 1º, 2º).
- **Para paginação:** use `ROW_NUMBER()` com `OFFSET`/`FETCH` ou com filtro `WHERE rn BETWEEN N AND M`.
- **Índices:** Para máxima performance, crie um índice composto com as colunas de `PARTITION BY` seguidas pelas colunas de `ORDER BY` (nessa ordem). Isso permite que o SQL Server evite o *Sort* e use um *Stream Aggregate*. Se não houver índice adequado, emita o handoff para `create_assertive_index`.
- **Subconsultas:** Substitua subconsultas de `COUNT` por `RANK()` ou `DENSE_RANK()` para evitar o custo O(n²).

---
**⚠️ Importante:** As funções de rank são frequentemente subestimadas, mas são ferramentas poderosas que eliminam a necessidade de lógica procedural complexa e subconsultas pesadas. Elas são essenciais para relatórios, rankings e paginação em grandes volumes de dados.