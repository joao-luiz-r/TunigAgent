---
name: replace_join_distinct_with_exists
description: Detecta o uso de INNER JOIN com DISTINCT (ou GROUP BY) para verificar a existência de registros em uma tabela relacionada, onde JOIN multiplica linhas e DISTINCT força um Sort caro. Recomenda substituir por EXISTS para eliminar duplicações desnecessárias, reduzir Sort e melhorar drasticamente a performance.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - join com distinct
  - distinct do join
  - join multiplica linhas
  - sort caro
  - join para verificar existencia
  - distinct com join
---

# Skill: replace_join_distinct_with_exists

## Quando usar

Use quando uma consulta utilizar um `INNER JOIN` com `DISTINCT` (ou `GROUP BY`) para listar registros da tabela principal que têm correspondência em uma tabela relacionada, **sem** necessidade de trazer colunas da tabela secundária.

**Padrão problemático:**

```sql
SELECT DISTINCT
    C.ClienteID,
    C.NomeCliente
FROM Clientes C
INNER JOIN Pedidos P ON C.ClienteID = P.ClienteID;
```

**O problema:** O `INNER JOIN` multiplica as linhas da tabela principal por cada correspondência na tabela secundária. Se um cliente tiver 100 pedidos, sua linha será duplicada 100 vezes no conjunto intermediário. O `DISTINCT` então executa uma operação cara de *Sort* (classificação) para eliminar as duplicatas. Isso gera:

- **Conjunto intermediário gigante:** milhões ou bilhões de linhas.
- **Sort pesado:** consumo alto de CPU e I/O.
- **Uso intenso de tempdb:** se o sort não couber em memória, dados são despejados em disco.
- **Tempo de execução prolongado:** consultas que deveriam ser rápidas levam minutos.

**A solução:** Substituir `JOIN + DISTINCT` por `EXISTS`, que verifica a existência de correspondência sem multiplicar linhas e sem necessidade de `DISTINCT`.

**⚠️ NÃO confunda:** esta skill é apenas para JOIN **com `DISTINCT`/`GROUP BY` desnecessário**. Se o JOIN for usado só para filtrar **sem** `DISTINCT`, use `[SKILL_HANDOFF:replace_join_with_exists]`. Se for um anti-join (`LEFT JOIN ... IS NULL`), use `[SKILL_HANDOFF:replace_left_join_isnull_with_not_exists]`.

## Instruções

Sua missão é identificar consultas com `INNER JOIN + DISTINCT` usadas para verificação de existência e reescrevê-las usando `EXISTS`.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Identifique a consulta:
   - Contém `SELECT DISTINCT` (ou `GROUP BY` com todas as colunas da tabela principal).
   - Possui `INNER JOIN` com uma tabela secundária.
   - Nenhuma coluna da tabela secundária é usada no `SELECT` ou no `WHERE` (apenas na condição de junção).
   - O `JOIN` é usado exclusivamente para verificar a existência de correspondência.
4. Reescreva a consulta:
   - Substitua `INNER JOIN ... ON condicao` por `WHERE EXISTS (SELECT 1 FROM tabela_secundaria WHERE condicao)`.
   - Remova `DISTINCT` (ou `GROUP BY`), pois não há mais duplicatas.
   - Mantenha todas as demais colunas e condições.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita para `EXISTS`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes (ex: índice na coluna de junção da tabela secundária), mencione isso.
   - Se faltar índices para otimizar a subconsulta (ex: `Pedidos.ClienteID`), acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** JOIN + DISTINCT para verificar existência, forçando Sort caro.

```sql
-- Objetivo: Listar clientes que fizeram pelo menos um pedido
-- Abordagem problemática: JOIN multiplica linhas, DISTINCT força Sort
SELECT DISTINCT
    C.ClienteID,
    C.NomeCliente
FROM Clientes C
INNER JOIN Pedidos P ON C.ClienteID = P.ClienteID;
```

**Solução (DEPOIS):** Substituir por EXISTS, eliminando duplicatas e Sort.

```sql
-- EXISTS: verifica correspondência sem multiplicar linhas
SELECT
    C.ClienteID,
    C.NomeCliente
FROM Clientes C
WHERE EXISTS (
    SELECT 1
    FROM Pedidos P
    WHERE P.ClienteID = C.ClienteID
);
```

**Motivo:** O `INNER JOIN` produz um conjunto intermediário onde cada linha da tabela `Clientes` é duplicada para cada pedido correspondente. Se um cliente tem 100 pedidos, sua linha aparece 100 vezes. O `DISTINCT` então precisa classificar e eliminar essas 99 duplicatas. Isso gera um *Sort* caro, que consome CPU, memória e, se necessário, `tempdb`.

O `EXISTS` é uma *semi-join*: para cada cliente, o SQL Server executa a subconsulta e **para na primeira correspondência encontrada**. Não há duplicatas, não há sort, não há conjunto intermediário gigante. A consulta é muito mais rápida e eficiente.

**Cenário hipotético de ganho:**

- `Clientes`: 100.000 registros.
- `Pedidos`: 10.000.000 registros (média de 100 pedidos por cliente).
- `JOIN + DISTINCT`: processa 10.000.000 linhas, depois classifica para remover 9.900.000 duplicatas.
- `EXISTS`: realiza 100.000 buscas indexadas, parando na primeira correspondência.

**Estimativa:** A abordagem com `EXISTS` pode ser centenas de vezes mais rápida que `JOIN + DISTINCT`.

## Recomendação

- **Regra de ouro:** Se você só precisa verificar se um registro existe em outra tabela **sem** trazer dados dela, use `EXISTS` (ou `NOT EXISTS` para ausência).
- **Use `JOIN` apenas quando** você precisar de colunas da tabela secundária no `SELECT` ou no `WHERE`.
- **Evite `DISTINCT` como bandagem:** Se você está usando `DISTINCT` para eliminar duplicatas geradas por um `JOIN`, reavalie se o `JOIN` é realmente necessário.
- **Verifique índices:** A performance do `EXISTS` depende de um índice eficiente na coluna de junção da tabela secundária (ex: `Pedidos.ClienteID`). Se não houver, emita o handoff para `create_assertive_index`.
- **Teste com dados reais:** Teoria é guia, mas performance real depende do ambiente. Teste ambas as abordagens com dados análogos à produção para validar o ganho.

---
**⚠️ Importante:** O `DISTINCT` desnecessário é uma das causas mais comuns de degradação de performance em consultas SQL. Muitas vezes, ele é adicionado como "bandagem" para resolver duplicatas geradas por `JOIN`s mal planejados. A substituição por `EXISTS` não apenas elimina o `DISTINCT`, mas também elimina a causa raiz das duplicatas, resultando em consultas mais rápidas, mais limpas e mais corretas semanticamente.