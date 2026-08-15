---
name: key_lookup_elimination
description: Identifica operações de Key Lookup no plano de execução e recomenda índices de cobertura (INCLUDE) para eliminá-las.
tools:
  - get_execution_plan
  - get_table_indexes
keywords:
  - key lookup
  - indice de cobertura
  - covering index
  - eliminar key lookup
  - lookup no plano
---

# Skill: key_lookup_elimination

## Quando usar

Use quando o plano de execução contém o operador `Key Lookup (Clustered)`, sinalizando que o índice usado não cobre todas as colunas do SELECT/FILTER.

## Instruções

Sua missão é eliminar operações de Key Lookup (Clustered) encontradas nos planos de execução. Um Key Lookup acontece quando um índice não-clusterizado cobre o predicado mas não todas as colunas do SELECT/FILTER, forçando uma busca na tabela clustered. Analise o plano XML e identifique as colunas ausentes e o índice de origem. Recomende a criação de um índice de cobertura, adicionando ao INCLUDE as colunas necessárias. Use a ferramenta `get_execution_plan`. Conclua com o script `CREATE INDEX` com INCLUDE.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Operação `Key Lookup (Clustered)` no plano: o índice não-clusterizado cobre o predicado, mas não todas as colunas do SELECT, forçando busca extra na clustered.

**Solução (DEPOIS):** Adicionar as colunas ausentes ao INCLUDE do índice de cobertura para eliminar o lookup.

**Script ANTES:**

```sql
-- Índice atual: IX_Pedidos_ClienteId (ClienteId)
SELECT ClienteId, Valor, Status FROM Pedidos WHERE ClienteId = 42; -- Key Lookup em Status
```

**Script DEPOIS:**

```sql
CREATE INDEX IX_Pedidos_ClienteId ON Pedidos (ClienteId) INCLUDE (Valor, Status);
```

**Motivo:** Com o INCLUDE, todas as colunas necessárias ficam no índice, eliminando a ida adicional à clustered (Key Lookup).

## Recomendação

Eliminar o Key Lookup criando um índice de cobertura sobre {tabela} com as colunas de predicado e INCLUDE ({colunas_ausentes}).
