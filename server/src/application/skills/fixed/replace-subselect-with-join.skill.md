---
name: replace_subselect_with_join
description: Detecta subconsultas correlacionadas (no SELECT ou no WHERE) que são executadas para cada linha da consulta principal e as reescreve como JOINS, melhorando a performance, reduzindo o custo de execução linha a linha e permitindo melhor uso de índices.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - subconsulta correlacionada
  - reescrever como join
  - subconsulta no where
  - join no lugar da subconsulta
  - reescrever subconsulta
  - subquery linha a linha
---

# Skill: replace_subselect_with_join

## Quando usar

Use quando uma consulta contiver subconsultas que fazem referência à tabela da consulta externa (subconsultas **correlacionadas**) nos seguintes contextos:

- **No `SELECT`** (subconsulta escalar): para buscar um valor de outra tabela com base em uma coluna da linha atual.
- **No `WHERE`** (filtro): para verificar uma condição que depende da linha atual.

Nesses casos, a subconsulta é reavaliada para **cada linha** da consulta principal, gerando um custo de execução (geralmente *Nested Loops* com lookup repetido). Substituir por um `JOIN` (ou `LEFT JOIN`) permite que o otimizador trabalhe com conjuntos inteiros, aplicando operações *Hash Match* ou *Merge Join*, que são muito mais eficientes em volumes grandes de dados.

## Instruções

Sua missão é identificar subconsultas correlacionadas e reescrevê-las como `JOINs`, mantendo exatamente o mesmo resultado lógico.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Analise a consulta:
   - Localize subconsultas no `SELECT` ou no `WHERE` que referenciam a tabela principal (ex: `SELECT (SELECT coluna FROM tabela2 WHERE tabela2.id = tabela1.id) FROM tabela1`).
   - Verifique se a subconsulta retorna um único valor (escalar) ou se é usada em comparação com `=`, `<>`, `>` etc.
   - Se a subconsulta no `WHERE` for usada com `=`, `<>`, ou `IN` (e for correlacionada), avalie a reescrita.
4. Reescreva a consulta:
   - Para subconsultas no `SELECT` (escalares): faça um `LEFT JOIN` com a tabela secundária para trazer o valor desejado, garantindo que linhas sem correspondência retornem `NULL` (igual à subconsulta).
   - Para subconsultas no `WHERE` (filtro): faça um `INNER JOIN` se a condição implicar existência (ex: `<> 'valor'` ou `= 'valor'` com tratamento de `NULL`), ou um `LEFT JOIN` com verificação de `IS NOT NULL`/`IS NULL` conforme a lógica.
   - **Atenção ao `NULL`:** subconsultas escalares retornam `NULL` quando não encontram correspondência. Um `INNER JOIN` elimina essas linhas; um `LEFT JOIN` as mantém com `NULL`, preservando o comportamento original.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita da subconsulta para `JOIN`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes, mencione isso.
   - Se faltar índices para as colunas de junção, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Subconsultas correlacionadas no `SELECT` e no `WHERE`, executadas linha a linha.

```sql
-- Exemplo extraído do PDF:
-- A subconsulta no SELECT busca o nome da UF para cada endereço.
-- A subconsulta no WHERE filtra as UFs diferentes de 'RJ'.
-- Ambas são executadas para cada linha de corp_endereco.
SELECT Ce.nm_endereco,
       Ce.nm_cidade,
       Ce.nm_bairro,
       UF = (SELECT Uf.nm_uf
             FROM corp_uf Uf
             WHERE Uf.cd_uf = Ce.cd_uf)
FROM corp_endereco Ce
WHERE (SELECT Uf.nm_uf
       FROM corp_uf Uf
       WHERE Uf.cd_uf = Ce.cd_uf) <> 'RJ';
```

**Solução (DEPOIS):** Substituir por `JOIN`, eliminando a execução linha a linha.

```sql
-- Reescrevendo com JOIN:
-- O INNER JOIN é adequado porque a condição WHERE (<> 'RJ') já exclui
-- tanto as UFs 'RJ' quanto os registros sem UF correspondente (NULL),
-- já que NULL <> 'RJ' é desconhecido e não é selecionado.
SELECT Ce.nm_endereco,
       Ce.nm_cidade,
       Ce.nm_bairro,
       UF = Uf.nm_uf
FROM corp_endereco Ce
JOIN corp_uf Uf ON Uf.cd_uf = Ce.cd_uf
WHERE Uf.nm_uf <> 'RJ';
```

**Motivo:** Subconsultas correlacionadas são executadas em modo *Row-by-Row* (linha a linha). Para cada linha da tabela `corp_endereco`, o SQL Server executa uma busca na tabela `corp_uf`. Em tabelas grandes, isso gera milhares ou milhões de acessos individuais. Ao transformar em `JOIN`, o otimizador pode usar algoritmos baseados em conjunto (como *Hash Match* ou *Merge Join*), lendo as duas tabelas no máximo uma vez cada, reduzindo drasticamente o custo de I/O e CPU.

**Atenção à equivalência lógica:**
- Se a subconsulta pode retornar `NULL` e você precisa preservar as linhas da tabela principal mesmo sem correspondência, use `LEFT JOIN` em vez de `INNER JOIN`. No exemplo acima, o `WHERE` com `<> 'RJ'` já elimina as linhas sem correspondência (pois `NULL <> 'RJ'` é `UNKNOWN`), então o `INNER JOIN` é equivalente.
- Se a subconsulta estiver apenas no `SELECT` (sem filtro no `WHERE`), use `LEFT JOIN` para manter o `NULL` para registros sem correspondência, exatamente como a subconsulta faria.

## Recomendação

- **Sempre** que encontrar uma subconsulta correlacionada no `SELECT` ou no `WHERE`, avalie a possibilidade de substituí-la por um `JOIN`.
- **Cuidado com `NULL`:** entenda se a lógica permite ou não a presença de `NULL`s. Use `LEFT JOIN` para preservar `NULL`s e `INNER JOIN` quando a existência for obrigatória.
- Verifique os índices das colunas de junção. No exemplo, `corp_uf.cd_uf` deve ter um índice para que o `JOIN` seja eficiente. Se não houver, emita o handoff para `create_assertive_index`.
- Essa técnica é especialmente benéfica para consultas que retornam muitas linhas e que usam subconsultas com tabelas auxiliares pequenas ou grandes.

---
**⚠️ Importante:** Esta skill NÃO cobre subconsultas não correlacionadas (fixas) – essas são tratadas pela skill `extract_fixed_subquery_to_variable`. Subconsultas com `EXISTS`/`NOT EXISTS` são cobertas por outras skills específicas (`replace_join_with_exists` e `replace_left_join_isnull_with_not_exists`). Aqui focamos exclusivamente em subconsultas escalares no `SELECT` ou no `WHERE`.