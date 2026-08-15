---
name: cache_string_split_with_temp_table
description: Detecta o uso repetido de STRING_SPLIT em uma consulta (especialmente no WHERE, JOIN, ou CROSS APPLY) e recomenda armazenar o resultado em uma variável de tabela ou tabela temporária para evitar execuções múltiplas, reduzindo custo de CPU e melhorando a performance em consultas complexas.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - string split repetido
  - string_split repetido
  - split varias vezes
  - cachear string split
  - usar variavel de tabela para split
  - split em uma tabela temporaria
---

# Skill: cache_string_split_with_temp_table

## Quando usar

Use quando uma consulta utilizar a função `STRING_SPLIT` **em múltiplos lugares** ou com **listas grandes** e a mesma string de entrada, como por exemplo:

- `WHERE column IN (SELECT value FROM STRING_SPLIT(@lista, ','))`
- `CROSS APPLY STRING_SPLIT(column, ',')` combinado com filtros que também usam `STRING_SPLIT`.
- Subconsultas repetidas com `STRING_SPLIT` para a mesma string literal ou variável.

O problema é que `STRING_SPLIT` é uma função **inline** que é executada **toda vez que é chamada**, mesmo que o parâmetro (a string a ser dividida) seja sempre o mesmo. Em consultas complexas, isso pode resultar em:

- Execução repetida da função, desperdiçando CPU e I/O.
- Custo multiplicado quando a função é usada várias vezes (ex: no `SELECT`, no `WHERE`, no `JOIN`).
- Plano de execução mais complexo, com múltiplas leituras da mesma lista.

A solução é **armazenar o resultado do `STRING_SPLIT` em uma variável de tabela ou tabela temporária** e reutilizá-la em toda a consulta. Isso garante que a divisão da string seja executada **uma única vez**.

## Instruções

Sua missão é identificar o uso repetido de `STRING_SPLIT` e reescrever a consulta para armazenar o resultado em uma variável de tabela ou tabela temporária.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Identifique onde `STRING_SPLIT` é usada:
   - No `SELECT`, `WHERE`, `JOIN`, `CROSS APPLY` ou subconsultas.
   - Verifique se a mesma string (literal ou variável) é usada em múltiplas chamadas.
4. Reescreva a consulta:
   - Declare uma variável de tabela (`@List`) ou tabela temporária (`#List`) com a estrutura apropriada (ex: uma coluna `value` do tipo `VARCHAR`).
   - Insira o resultado de `STRING_SPLIT` nessa estrutura **uma única vez**.
   - Substitua todas as chamadas repetidas de `STRING_SPLIT` pela variável/tabela temporária.
   - Ajuste os `JOIN`s, `WHERE` e `CROSS APPLY` para usar a estrutura cacheada.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita para cachear o `STRING_SPLIT`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes, mencione isso.
   - Se a consulta puder se beneficiar de índices adicionais (ex: na coluna filtrada com a lista), acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Uso repetido de `STRING_SPLIT` na mesma consulta.

```sql
-- Exemplo extraído do arquivo: STRING_SPLIT usado duas vezes
SELECT o.OrderID,
       ss.value AS ProductID
FROM Orders o
CROSS APPLY STRING_SPLIT(o.ProductList, ',') ss
WHERE ss.value IN (SELECT value FROM STRING_SPLIT('101,102,103', ','));
```

Neste exemplo, `STRING_SPLIT` é executada uma vez para dividir a lista de produtos de cada pedido (`o.ProductList`) e outra vez para dividir a lista fixa no `WHERE`.

**Solução (DEPOIS):** Armazenar a lista fixa em uma variável de tabela.

```sql
-- Declarar variável de tabela para cachear a lista fixa
DECLARE @ProductList TABLE (ProductID INT);

INSERT INTO @ProductList (ProductID)
SELECT value
FROM STRING_SPLIT('101,102,103', ',');

-- Usar a variável de tabela no lugar da segunda chamada de STRING_SPLIT
SELECT o.OrderID,
       ss.value AS ProductID
FROM Orders o
CROSS APPLY STRING_SPLIT(o.ProductList, ',') ss
WHERE ss.value IN (SELECT ProductID FROM @ProductList);
```

**Motivo:** A primeira versão executa `STRING_SPLIT` duas vezes: uma para cada pedido (dentro do `CROSS APPLY`, que já é necessário) e outra para a lista fixa no `WHERE`. A lista fixa é a mesma para todas as linhas, então é um desperdício processá-la repetidamente. Ao cachear o resultado da lista fixa em uma variável de tabela, a função é executada **apenas uma vez** para a lista fixa, e a consulta principal reutiliza o conjunto de valores. Isso reduz o custo de CPU e I/O, especialmente se a lista for grande ou usada em várias partes da consulta.

## Recomendação

- **Sempre que a mesma string for usada em múltiplos `STRING_SPLIT`**, cacheie o resultado em uma variável de tabela (`@List`) ou tabela temporária (`#List`).
- **Para listas grandes**, uma tabela temporária (`#List`) pode ser mais eficiente que uma variável de tabela, pois permite a criação de índices (ex: `CREATE INDEX idx ON #List (value)`).
- **Se a lista for usada em um `IN` ou `JOIN`**, a variável/tabela temporária é uma alternativa direta.
- **Se a lista for usada com `CROSS APPLY`** (ex: para dividir uma coluna da tabela principal), não é possível cachear facilmente, pois depende de cada linha. Nesse caso, apenas as listas fixas (literais, variáveis) devem ser cacheadas.
- **Atenção ao tipo de dado:** O `STRING_SPLIT` retorna uma coluna `value` do tipo `NVARCHAR(MAX)`. Certifique-se de que a estrutura da variável/tabela temporária seja compatível com o uso na consulta (ex: `INT` se os valores forem numéricos).
- **Monitore a performance:** Use `SET STATISTICS IO, TIME ON` para comparar as duas versões e confirmar o ganho.

---
**⚠️ Importante:** O `STRING_SPLIT` é uma função poderosa, mas como qualquer função, deve ser usada com parcimônia. Cachear o resultado quando a entrada é estática é uma prática simples que pode gerar ganhos significativos em consultas complexas.