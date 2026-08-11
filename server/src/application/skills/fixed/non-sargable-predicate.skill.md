---
name: avoid_non_sargable_predicate
description: Detecta predicados não-sargáveis (função ou aritmética na coluna dentro do WHERE) e os reescreve para permitir o uso de índice.
tools:
  - get_query_text
  - get_table_indexes
---

# Skill: avoid_non_sargable_predicate

## Quando usar

Use quando uma função ou expressão aritmética é aplicada diretamente na coluna dentro do WHERE (ex: `YEAR(DataVenda) = 2024`, `Coluna + 1 > 10`, `Coluna / 2 * 2 > 80`), impedindo o uso de índice.

## Instruções

Sua missão é identificar predicados não-sargáveis: quando uma função ou expressão aritmética é aplicada diretamente na COLUNA dentro do WHERE, o SQL Server não consegue usar o índice daquela coluna. Reescreva a expressão para operar sobre o VALOR em vez da coluna, preservando exatamente o mesmo resultado e ordenação.

Antes de concluir, verifique os índices existentes da tabela:

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes da tabela envolvida com `get_table_indexes`.
3. Confirme na resposta se existe (ou não) um índice sobre a coluna afetada e se a reescrita sargável permite aproveitá-lo.

**SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita sargável do predicado. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`). Isso é responsabilidade da skill dedicada `create_assertive_index`.

- Se a reescrita sargável puder ser aproveitada por um índice que JÁ EXISTE, apenas explique isso na resposta.
- Se não existir um índice adequado, conclua a análise com a reescrita sargável e, em seguida, acione a skill de criação de índices emitindo na resposta o marcador de handoff: `[SKILL_HANDOFF:create_assertive_index]`. O harness fará a transição automaticamente.
- NUNCA emita um script `CREATE INDEX` nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Expressão aritmética ou função aplicada diretamente na coluna dentro do WHERE, impedindo o uso de índice.

**Solução (DEPOIS):** Reescrever a expressão para operar sobre o valor constante, mantendo o mesmo resultado e permitindo Index Seek. Se faltar índice, a skill `create_assertive_index` é acionada via handoff.

**Script ANTES:**

```sql
SELECT * FROM Clientes WHERE customerID / 2 * 2 > 80;
```

**Script DEPOIS:**

```sql
SELECT * FROM Clientes WHERE customerID > 160 AND customerID % 2 = 0;
```

**Motivo:** Ao aplicar aritmética/função na coluna, o índice da coluna não pode ser usado (não-sargável) e o SQL Server força um scan. Operando sobre o valor, o predicado vira sargável. A criação/adequação de índices cabe à skill `create_assertive_index`.

## Recomendação

Reescrever o predicado não-sargável para operar sobre o valor: substituir {expressao_na_coluna} pela forma equivalente {forma_sargavel}. Verifique os índices existentes com `get_table_indexes` antes de responder. Se a reescrita será aproveitada por um índice existente, cite-o. Se faltar um índice, NÃO crie o script aqui — emita `[SKILL_HANDOFF:create_assertive_index]` para que a skill de criação de índices assuma.
