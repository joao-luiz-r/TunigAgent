---
name: avoid_isnull_in_where
description: Detecta o uso da função ISNULL em colunas dentro do WHERE, que torna o predicado não-sargável e impede o uso de índices. Recomenda a reescrita para a forma equivalente com OR e IS NULL, preservando a lógica e permitindo Index Seek.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - isnull na coluna
  - isnull no where
  - funcao isnull
  - isnull coluna
  - reescrever isnull
---

# Skill: avoid_isnull_in_where

## Quando usar

Use quando a cláusula `WHERE` contiver a função `ISNULL` aplicada diretamente a uma coluna, como em:

- `WHERE ISNULL(coluna, 0) = 0`
- `WHERE ISNULL(nm_cep, '') = ''`
- `WHERE ISNULL(idade, 18) >= 18`

Nesses casos, o SQL Server não consegue usar um índice na coluna, pois a função é aplicada sobre a própria coluna, tornando o predicado **não-sargável** e forçando um *Index Scan* (ou *Table Scan*).

## Instruções

Sua missão é identificar predicados que utilizam `ISNULL` sobre a coluna e reescrevê-los para a forma equivalente com `OR` e `IS NULL`, que é sargável e permite o uso de índice.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes da tabela envolvida com `get_table_indexes`.
3. Identifique a cláusula `WHERE` que aplica `ISNULL` na coluna.
4. Reescreva o predicado substituindo:
   - `ISNULL(coluna, valor_padrao) = valor_comparacao`
   - pela forma equivalente:
   - `(coluna = valor_comparacao OR coluna IS NULL)`
   - **Atenção:** essa reescrita mantém exatamente a mesma lógica, pois `ISNULL(coluna, valor_padrao)` retorna `valor_padrao` quando a coluna é `NULL`, então a comparação é verdadeira tanto quando a coluna é igual ao valor quanto quando é `NULL` (desde que `valor_padrao` seja igual a `valor_comparacao`).
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita sargável do predicado. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita puder ser aproveitada por um índice que JÁ EXISTE, apenas explique isso na resposta.
   - Se não existir um índice adequado, conclua a análise com a reescrita sargável e, em seguida, acione a skill de criação de índices emitindo na resposta o marcador de handoff: `[SKILL_HANDOFF:create_assertive_index]`. O harness fará a transição automaticamente.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Uso de `ISNULL` na coluna dentro do WHERE, impedindo o uso de índice.

```sql
-- Exemplo 1: Busca por CEP vazio
SELECT id_endereco
FROM corp_endereco
WHERE ISNULL(nm_cep, '') = '';

-- Exemplo 2: Busca por campo numérico com valor padrão
SELECT *
FROM Produtos
WHERE ISNULL(quantidade, 0) = 0;
```

**Solução (DEPOIS):** Reescrever para a forma com `OR` e `IS NULL`, que é sargável.

```sql
-- Exemplo 1 reescrito
SELECT id_endereco
FROM corp_endereco
WHERE (nm_cep = '' OR nm_cep IS NULL);

-- Exemplo 2 reescrito
SELECT *
FROM Produtos
WHERE (quantidade = 0 OR quantidade IS NULL);
```

**Motivo:** Ao aplicar `ISNULL` na coluna, o SQL Server precisa avaliar a função para cada linha antes de fazer a comparação, impossibilitando o uso do índice da coluna. Ao reescrever para `(coluna = valor OR coluna IS NULL)`, o otimizador pode utilizar um *Index Seek* na coluna (desde que exista um índice adequado), pois a comparação é feita diretamente com a coluna, sem função intermediária.

## Recomendação

Sempre que encontrar `ISNULL(coluna, valor_padrao)` em uma cláusula `WHERE`, reescreva para a forma com `OR` e `IS NULL`. Essa prática é simples, mantém a mesma lógica e pode trazer ganhos significativos de performance em tabelas grandes.

- Certifique-se de que o valor padrão usado no `ISNULL` é o mesmo valor que está sendo comparado.
- Verifique se a coluna possui um índice. Se não houver, emita o handoff para `create_assertive_index` para avaliar a criação de um índice que beneficie a consulta.
- Caso a coluna seja do tipo `VARCHAR`, lembre-se de que a string vazia (`''`) é diferente de `NULL`. A reescrita com `OR` cobre ambos os casos, exatamente como o `ISNULL`.

---
**⚠️ Importante:** Esta skill NÃO cobre o uso de `ISNULL` em outras cláusulas (como `SELECT` ou `ORDER BY`), apenas no `WHERE`. Para outros contextos, outras técnicas podem ser necessárias.