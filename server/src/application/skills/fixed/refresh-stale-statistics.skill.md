---
name: refresh_stale_statistics
description: Detecta estatísticas desatualizadas (staleness) que geram planos ruins e recomenda a atualização com FULLSCAN ou SAMPLE quando apropriado.
tools:
  - get_table_schema
  - get_execution_plan
  - get_query_text
  - get_table_statistics
keywords:
  - stale statistics
  - estatisticas desatualizadas
  - update statistics
  - cardinalidade errada
  - estatisticas antigas
  - criar estatisticas
---

# Skill: refresh_stale_statistics

## Quando usar

Use quando o plano mostra estimativas de cardinalidade muito divergentes das linhas reais, ou quando há muitas modificações de linhas desde o último `UPDATE STATISTICS`.

## Instruções

Sua missão é identificar estatísticas desatualizadas que degradam os planos de execução. Verifique a data da última atualização, o volume de modificações de linhas (row modifications) e os sinais no plano (estimativas vs. linhas reais muito divergentes). Use a ferramenta `get_table_statistics` para inspecionar todas as estatísticas da tabela (última atualização, linhas, linhas amostradas e `modification_counter`), e `get_table_schema` para o contexto das colunas. Recomende `UPDATE STATISTICS` com FULLSCAN para tabelas pequenas/médias ou SAMPLE para tabelas grandes, e avalie configurar o limiar de desatualização (`AUTO_UPDATE_STATISTICS`). Conclua com os comandos de atualização recomendados.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Estatísticas desatualizadas: muitas modificações de linhas desde o último `UPDATE STATISTICS`, levando a estimativas de cardinalidade erradas e planos ruins (scans desnecessários).

**Solução (DEPOIS):** Atualizar as estatísticas com FULLSCAN (tabelas pequenas/médias) ou SAMPLE, ou configurar `AUTO_UPDATE_STATISTICS` e o limiar de desatualização.

**Script ANTES:**

```sql
UPDATE STATISTICS Pedidos; -- sem FULLSCAN, sem verificar necessidade
```

**Script DEPOIS:**

```sql
UPDATE STATISTICS Pedidos WITH FULLSCAN;
```

**Motivo:** O otimizador confia nas estatísticas para estimar cardinalidade; estatísticas antigas geram estimativas ruins, planos ruins e I/O desnecessário.

## Recomendação

Atualizar as estatísticas de {tabela} ({coluna}) com {metodo} para corrigir a estimativa de cardinalidade e estabilizar o plano de execução.
