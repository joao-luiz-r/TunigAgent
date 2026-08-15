---
name: encapsulate_case_with_correlated_subquery
description: Detecta o uso de Simple CASE com subquery como argumento (ex: CASE (SELECT ...) WHEN 1 THEN ...) que pode causar reavaliações múltiplas da subquery para cada linha, gerando overhead de CPU e múltiplos acessos ao disco. Recomenda encapsular a subquery e o CASE dentro de uma única subconsulta correlacionada para garantir execução única por linha e performance constante.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - case com subquery
  - simple case
  - subquery como argumento do case
  - case subquery
  - subconsulta dentro do case
  - encapsular subquery no case
---

# Skill: encapsulate_case_with_correlated_subquery

## Quando usar

Use quando uma consulta contiver uma construção onde uma subquery é usada como argumento de um `CASE` (Simple CASE), como no padrão:

```sql
SELECT
    id,
    CASE (SELECT valor FROM tabela WHERE tabela.id_relacionado = principal.id)
        WHEN 1 THEN 'v1'
        WHEN 2 THEN 'v2'
        WHEN 3 THEN 'v3'
    END AS resultado
FROM principal;
```

**Problema:** O desenvolvedor acredita que a subquery será executada uma única vez e o resultado será distribuído entre as condições `WHEN`. Porém, o SQL Server frequentemente expande o Simple CASE para um Searched CASE (com múltiplos `OR`/`AND`), o que pode fazer com que a subquery seja reavaliada para cada condição `WHEN`, resultando em múltiplas execuções da mesma subquery para cada linha da tabela principal. Isso causa:

- **Overhead de CPU** – reavaliações redundantes.
- **Múltiplos acessos ao disco** – a subquery pode ser executada várias vezes para a mesma linha.
- **Planos ineficientes** – operadores de Nested Loops duplicados no plano de execução.

A solução é **encapsular o `CASE` dentro da própria subquery**, de forma que a subquery execute uma única vez por linha da tabela principal e retorne o valor já transformado.

## Instruções

Sua missão é identificar o padrão `CASE (subquery) WHEN ...` e reescrevê-lo movendo o `CASE` para dentro da subconsulta correlacionada.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Identifique a construção problemática:
   - Localize `CASE (SELECT ... FROM tabela WHERE tabela.id_relacionado = principal.id) WHEN ... THEN ... END`.
   - Verifique se a subquery retorna um único valor escalar e é correlacionada.
4. Reescreva a consulta:
   - Transforme o `CASE` externo em uma subconsulta no `SELECT` que já contém o `CASE` dentro dela.
   - A subconsulta deve fazer a busca na tabela secundária e aplicar a lógica `CASE` diretamente no valor retornado.
   - A subconsulta é executada estritamente uma única vez por linha da tabela principal.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita da construção `CASE` com subquery. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes (ex: índice na coluna de junção), mencione isso.
   - Se faltar índices para otimizar a subconsulta, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Simple CASE com subquery como argumento, podendo causar reavaliações múltiplas.

```sql
-- Exemplo extraído do PDF: CASE com subquery no argumento
SELECT
    p.id,
    CASE (SELECT t.valor FROM tabela t WHERE t.id_relacionado = p.id)
        WHEN 1 THEN 'v1'
        WHEN 2 THEN 'v2'
        WHEN 3 THEN 'v3'
        WHEN 4 THEN 'v4'
    END AS resultado
FROM principal p;
```

**Solução (DEPOIS):** Encapsular o CASE dentro da subquery, garantindo uma única execução.

```sql
SELECT
    p.id,
    (
        SELECT
            CASE t.valor
                WHEN 1 THEN 'v1'
                WHEN 2 THEN 'v2'
                WHEN 3 THEN 'v3'
                WHEN 4 THEN 'v4'
            END
        FROM tabela t
        WHERE t.id_relacionado = p.id
    ) AS resultado
FROM principal p;
```

**Motivo:** No padrão original, o SQL Server frequentemente expande o Simple CASE para uma estrutura de Searched CASE (equivalente a `WHEN (SELECT ...) = 1 THEN ...`). O otimizador pode reavaliar a subquery para cada condição `WHEN`, resultando em múltiplas execuções (ex: quatro execuções da subquery para quatro condições) para cada linha da tabela `principal`. Isso gera um plano com múltiplos operadores de busca (Nested Loops) e alto custo de CPU e I/O.

Ao encapsular o `CASE` dentro da própria subquery, o SQL Server executa a subquery **uma única vez por linha** da tabela principal, retorna o valor já transformado e o plano de execução apresenta apenas **um único operador de junção/busca** para a tabela secundária. O resto da lógica (`CASE`) vira um simples `Compute Scalar` (cálculo em memória), sem novos acessos ao disco.

## Recomendação

- **Sempre** que usar `CASE` com uma subquery como argumento, mova o `CASE` para dentro da subquery.
- Essa técnica é especialmente importante para tabelas grandes, onde cada acesso extra ao disco pode ser significativo.
- **Verifique o plano de execução:** Antes da reescrita, você provavelmente verá múltiplos operadores de busca ou `Nested Loops` para a tabela secundária. Depois, verá apenas um único operador.
- **Cuidado com NULL:** Se a subquery retornar `NULL`, o `CASE` dentro dela também retornará `NULL`, mantendo a mesma lógica da versão original (onde `NULL` não satisfaz nenhum `WHEN` e o `CASE` retorna `NULL`).
- **Índices:** Certifique-se de que a coluna de junção (ex: `tabela.id_relacionado`) tenha um índice. Se não, emita o handoff para `create_assertive_index` para avaliar a criação.

---
**⚠️ Importante:** Essa técnica foi popularizada pelo especialista Fabiano Amorim e é uma das soluções mais poderosas para otimizar subconsultas usadas em `CASE`. Ela força o SQL Server a tratar a subquery como um bloco isolado e executá-la uma única vez por linha, garantindo performance constante mesmo com muitas condições `WHEN`.