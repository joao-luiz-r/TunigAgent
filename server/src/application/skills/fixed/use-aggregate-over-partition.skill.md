---
name: use_aggregate_over_partition
description: Detecta subconsultas no SELECT que trazem agregados (SUM, AVG, COUNT, MIN, MAX) por grupo (ex: total de vendas por cliente) e recomenda substituir por funções de janela com PARTITION BY, eliminando a execução da subconsulta para cada linha e reduzindo drasticamente o custo de CPU e I/O.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - agregado por grupo
  - window function
  - partition by
  - funcao de janela
  - agregado sem subconsulta
  - total por grupo
---

# Skill: use_aggregate_over_partition

## Quando usar

Use quando uma consulta precisar exibir, para cada linha de detalhe, um **agregado calculado sobre todo o grupo** ao qual aquela linha pertence, como por exemplo:

- Em cada venda, mostrar o total de vendas daquele cliente.
- Em cada pedido, mostrar a quantidade total de itens daquele produto.
- Em cada funcionário, mostrar o salário médio do departamento.
- Em cada linha de nota fiscal, mostrar o valor total da nota.

O padrão típico (e ineficiente) para resolver isso é:

- Subconsulta no `SELECT` com `SUM()`, `AVG()`, `COUNT()`, `MIN()`, `MAX()` e uma condição de junção (`WHERE tabela_externa.chave = tabela_interna.chave`).
- Uso de `JOIN` com uma subconsulta agregada (ex: `JOIN (SELECT chave, SUM(valor) FROM ... GROUP BY chave) AS agg ON ...`).

Essas abordagens são caras porque:

- A subconsulta no `SELECT` executa uma agregação separada para **cada linha** da tabela principal (custo O(n * m), onde m é o número de grupos).
- O `JOIN` com subconsulta agregada exige uma segunda leitura completa da tabela e pode gerar um operador de *Hash Match* ou *Merge Join* desnecessário.
- O código fica menos legível e mais sujeito a erros.

A Window Function com `SUM() OVER (PARTITION BY ...)` (ou `AVG()`, `COUNT()`, etc.) resolve o problema com **uma única passagem** pelos dados, calculando o agregado uma vez por grupo e disponibilizando-o para todas as linhas do grupo.

## Instruções

Sua missão é identificar subconsultas agregadas no `SELECT` (ou `JOIN` com subconsulta) e reescrevê-las usando funções de janela com `PARTITION BY`.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Identifique a subconsulta que calcula um agregado por grupo (ex: `SELECT SUM(valor) FROM tabela2 WHERE tabela2.chave = tabela1.chave`).
4. Reescreva a consulta:
   - Substitua a subconsulta por `SUM(coluna) OVER (PARTITION BY coluna_do_grupo)` (ou `AVG`, `COUNT`, `MIN`, `MAX` conforme necessário).
   - Se a subconsulta tiver filtros adicionais (ex: `WHERE status = 'A'`), inclua esses filtros na consulta principal antes da Window Function (já que o particionamento deve considerar apenas as linhas que atendem ao filtro).
   - Mantenha todas as demais colunas no `SELECT` e condições no `WHERE`.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita com funções de janela agregadas. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes (especialmente índices que cubram as colunas de `PARTITION BY` e as colunas do agregado), mencione isso.
   - Se faltar índices para otimizar a consulta, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Subconsulta no SELECT para calcular total de vendas por cliente.

```sql
-- Mostrar cada venda com o total de vendas daquele cliente
SELECT
    v.VendaID,
    v.ClienteID,
    v.Valor,
    (SELECT SUM(v2.Valor)
     FROM Vendas v2
     WHERE v2.ClienteID = v.ClienteID) AS TotalCliente
FROM Vendas v;
```

**Solução (DEPOIS):** Usar `SUM() OVER (PARTITION BY ...)`.

```sql
SELECT
    VendaID,
    ClienteID,
    Valor,
    SUM(Valor) OVER (PARTITION BY ClienteID) AS TotalCliente
FROM Vendas;
```

**Motivo:** A subconsulta no `SELECT` executa um `SUM()` separado para cada linha da tabela `Vendas`. Se a tabela tiver 100.000 linhas, a subconsulta será executada 100.000 vezes, cada uma agregando as vendas do cliente correspondente. Isso resulta em um plano com um operador *Nested Loops* e múltiplos *Index Seeks* (ou *Scans*). O `SUM() OVER (PARTITION BY ClienteID)` faz uma única passagem pelos dados, calcula o total para cada cliente uma vez, e "espalha" esse valor para todas as linhas daquele cliente no mesmo operador de *Window Aggregate*. O plano fica muito mais eficiente, com um único *Table Scan* (ou *Index Scan*) e um operador de *Window Aggregate* com *Sort* (se necessário) ou *Stream Aggregate*.

**⚠️ NÃO confunda com `use_apply_for_multiple_aggregates`:** a Window Function `OVER (PARTITION BY ...)` calcula o agregado **sobre o mesmo conjunto de linhas do resultado** (uma única tabela/derivação). O `APPLY` é usado quando os agregados vêm de **outra tabela secundária** (ex: `CustomerID` em `Orders` enquanto o detalhe é de `Customers`) — veja a skill `use_apply_for_multiple_aggregates`. Se a subconsulta agrega a mesma tabela do detalhe `WHERE chave = chave`, use `OVER (PARTITION BY chave)`; se agrega uma tabela distinta por linha, use `APPLY`.

---

## Recomendação

- **Use `SUM() OVER (PARTITION BY ...)`** sempre que precisar de um agregado por grupo em cada linha de detalhe.
- **Para outros agregados:** substitua `SUM` por `AVG`, `COUNT`, `MIN`, `MAX` conforme a necessidade.
- **Filtros na subconsulta:** se a subconsulta tiver filtros (ex: `WHERE status = 'A'`), você precisará aplicar o filtro na consulta principal antes da Window Function. Por exemplo:
  ```sql
  -- Subconsulta original
  (SELECT SUM(Valor) FROM Vendas v2 WHERE v2.ClienteID = v.ClienteID AND v2.Status = 'A')
  ```
  Isso deve ser reescrito como:
  ```sql
  -- Filtro aplicado na subconsulta, com PARTITION BY considerando apenas as linhas filtradas
  SELECT
      VendaID,
      ClienteID,
      Valor,
      SUM(CASE WHEN Status = 'A' THEN Valor ELSE 0 END) OVER (PARTITION BY ClienteID) AS TotalCliente
  FROM Vendas;
  ```
  Ou, se preferir, use uma subconsulta com `WHERE Status = 'A'` e faça a Window Function sobre essa subconsulta.
- **Evite `JOIN` com subconsulta agregada:** quando possível, prefira a Window Function para evitar uma segunda leitura completa da tabela.
- **Índices:** Para máxima performance, crie um índice composto com a coluna de `PARTITION BY` e a coluna do agregado (ex: `(ClienteID, Valor)`). Isso permite que o SQL Server use um *Index Scan* ordenado e evite o *Sort* no operador de *Window Aggregate*. Se não houver índice adequado, emita o handoff para `create_assertive_index`.

---
**⚠️ Importante:** Diferente do `SUM() OVER` com `ORDER BY` (running total), este padrão não usa `ORDER BY` dentro do `OVER()`. Apenas `PARTITION BY` é suficiente para calcular o agregado por grupo. Isso faz com que o operador de *Window Aggregate* seja ainda mais leve, pois não requer ordenação dentro da partição.