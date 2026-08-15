---
name: avoid_not_in_with_nulls
description: Detecta o uso de NOT IN em subconsultas onde a coluna pode conter NULLs, que pode invalidar a condição e retornar resultados vazios ou incorretos. Recomenda a substituição por NOT EXISTS ou LEFT JOIN ... IS NULL, que são robustos a NULLs e semanticamente corretos.
tools:
  - get_query_text
  - get_table_indexes
  - get_table_schema
keywords:
  - not in com null
  - resultados vazios
  - substrata not in
  - not in com nulos
  - not in na subconsulta
---

# Skill: avoid_not_in_with_nulls

## Quando usar

Use quando uma consulta utilizar `NOT IN` com uma subconsulta para encontrar registros que **não** têm correspondência em outra tabela, como por exemplo:

- Clientes que não fizeram pedidos.
- Produtos que não foram vendidos.
- Funcionários sem registros de ponto.
- Transações sem itens associados.

**O perigo:** Se a coluna retornada pela subconsulta permitir `NULL` e houver pelo menos um `NULL` na lista, a condição `NOT IN` **retorna vazio ou incorreto** sem nenhum erro ou aviso.

**Exemplo do problema:**

```sql
-- Se Pedidos.IDCliente puder ser NULL, esta query pode retornar 0 linhas!
SELECT IDCliente, NomeCliente
FROM Clientes
WHERE IDCliente NOT IN (SELECT IDCliente FROM Pedidos);
```

**Explicação:** Quando a subconsulta retorna um `NULL`, a condição `WHERE IDCliente NOT IN (lista)` se torna uma série de comparações como `IDCliente <> valor1 AND IDCliente <> valor2 AND ... AND IDCliente <> NULL`. Qualquer comparação com `NULL` é `UNKNOWN`, e a condição `WHERE` só retorna linhas quando a expressão é `TRUE`. Se houver um `NULL` na lista, a condição inteira se torna `FALSE` ou `UNKNOWN`, e a query retorna **nenhuma linha**.

**Solução robusta:** Use `NOT EXISTS` (recomendado) ou `LEFT JOIN ... IS NULL`, que lidam corretamente com `NULL` e expressam claramente a intenção de "ausência de correspondência".

## Instruções

Sua missão é identificar consultas com `NOT IN` que podem ser afetadas por `NULL`s e reescrevê-las usando `NOT EXISTS` ou `LEFT JOIN ... IS NULL`.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Identifique a cláusula `WHERE` com `NOT IN (SELECT ...)`.
4. Verifique se a coluna na subconsulta pode conter `NULL` (ex: a coluna não tem `NOT NULL`).
5. Reescreva a consulta:
   - **Opção 1 (recomendada):** substitua `NOT IN` por `NOT EXISTS` com uma subconsulta correlacionada.
   - **Opção 2 (alternativa):** substitua `NOT IN` por `LEFT JOIN` com `IS NULL`.
6. Mantenha todas as demais colunas no `SELECT` e condições no `WHERE`.
7. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita da consulta para evitar o problema com `NULL`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes (ex: índice na coluna de junção), mencione isso.
   - Se faltar índices para otimizar a subconsulta ou o `JOIN`, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Uso de `NOT IN` com subconsulta que pode retornar `NULL`.

```sql
-- RISCO: Se Pedidos.IDCliente puder ser NULL, esta query NÃO funcionará corretamente.
-- A presença de um único NULL na subquery faz com que a condição avalie para UNKNOWN/FALSE,
-- e a query retorna 0 linhas, mesmo que existam clientes sem pedidos.
SELECT IDCliente, NomeCliente
FROM Clientes
WHERE IDCliente NOT IN (SELECT IDCliente FROM Pedidos);
```

**Solução (DEPOIS) – Opção 1: Usar NOT EXISTS (recomendado).**

```sql
-- Verifica a ausência de qualquer pedido para o cliente (correlacionado)
SELECT IDCliente, NomeCliente
FROM Clientes C
WHERE NOT EXISTS (
    SELECT 1
    FROM Pedidos P
    WHERE P.IDCliente = C.IDCliente
);
```

**Solução (DEPOIS) – Opção 2: Usar LEFT JOIN ... IS NULL (alternativa).**

```sql
-- Tenta juntar clientes com pedidos; mantém os que não tiveram correspondência
SELECT C.IDCliente, C.NomeCliente
FROM Clientes C
LEFT JOIN Pedidos P ON C.IDCliente = P.IDCliente
WHERE P.IDPedido IS NULL; -- Filtra clientes sem correspondência
```

**Motivo:** O `NOT IN` é vulnerável a `NULL`s porque qualquer comparação com `NULL` é `UNKNOWN`. Se a subconsulta retornar `NULL`, a condição `NOT IN` se torna `FALSE` ou `UNKNOWN` para **todas** as linhas, resultando em zero linhas retornadas. Esse é um bug sutil: a query executa sem erro, mas retorna um resultado incorreto sem aviso.

O `NOT EXISTS` verifica a existência de **qualquer** linha que satisfaça a condição, sem se importar com `NULL`s na coluna de junção. A semântica é exatamente "não existe correspondência". O `LEFT JOIN ... IS NULL` também é robusto: a coluna da tabela da direita será `NULL` apenas quando não houver correspondência, e a condição `IS NULL` filtra exatamente essas linhas.

## Recomendação

- **Prefira `NOT EXISTS`:** é semanticamente mais claro (expressa diretamente a intenção) e geralmente apresenta performance igual ou superior ao `LEFT JOIN`.
- **Use `LEFT JOIN ... IS NULL`** se você precisar trazer colunas da tabela secundária (ex: para verificar se algo mudou) ou se a consulta já estiver usando `LEFT JOIN` para outros fins.
- **Evite `NOT IN`** sempre que a coluna da subconsulta não for `NOT NULL`. Se você tiver certeza absoluta de que a coluna é `NOT NULL` (ex: chave primária), o `NOT IN` pode ser seguro, mas ainda assim é recomendado usar `NOT EXISTS` por clareza e robustez.
- **Verifique índices:** As abordagens com `NOT EXISTS` e `LEFT JOIN` se beneficiam de índices na coluna de junção da tabela secundária (ex: `Pedidos.IDCliente`). Se não houver, emita o handoff para `create_assertive_index`.
- **Teste com dados:** Sempre teste a consulta com dados que incluem `NULL` na coluna de junção para confirmar que o comportamento está correto.

---
**⚠️ Importante:** O problema com `NOT IN` e `NULL` é uma das armadilhas mais comuns e perigosas em SQL. Muitos desenvolvedores descobrem o bug apenas em produção, quando um `NULL` aparece inesperadamente. Use `NOT EXISTS` ou `LEFT JOIN ... IS NULL` para garantir resultados corretos e robustos.