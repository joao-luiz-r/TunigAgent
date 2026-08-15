---
name: avoid_heap_table
description: Detecta tabelas sem índice clustered (heaps) e recomenda a criação de um clustered index para eliminar table scans, forwarding e fragmentação.
tools:
  - get_table_schema
keywords:
  - tabela heap
  - heap table
  - sem clustered
  - sem indice clustered
  - forwarding record
  - heap com forwarding
---

# Skill: avoid_heap_table

## Quando usar

Use quando uma tabela consultada com frequência não possui índice clustered (é um heap), causando table scans completos e forwarding.

## Instruções

Sua missão é identificar tabelas heap (sem índice clustered) consultadas com frequência. Heaps causam table scans completos, operações de forwarding quando a linha cresce, e impossibilitam Index Seek eficiente. Analise o schema das tabelas coletado e recomende a criação de um índice clustered (idealmente sobre uma coluna única e crescente, como um IDENTITY ou chave natural). Use a ferramenta `get_table_schema`. Conclua com o script `CREATE CLUSTERED INDEX`.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Tabela heap (sem índice clustered) consultada com frequência, forçando table scans completos.

**Solução (DEPOIS):** Criar um índice clustered sobre uma coluna única e monotonicamente crescente para transformar scans em seeks.

**Script ANTES:**

```sql
SELECT * FROM LogEventos WHERE ClienteId = 42; -- table scan em heap
```

**Script DEPOIS:**

```sql
CREATE CLUSTERED INDEX IX_LogEventos_Id ON LogEventos (Id);
SELECT * FROM LogEventos WHERE ClienteId = 42;
```

**Motivo:** Sem clustered index, todas as consultas varrem o heap inteiro; com o índice clustered o acesso por chave vira seek.

## Recomendação

Criar um índice clustered em {tabela} sobre {coluna} para eliminar table scans e forwarding de uma tabela heap.
