---
name: general_tuning
description: Análise geral de tuning: coleta plano de execução, texto de consulta, waits e índices para diagnosticar gargalos de performance não específicos.
tools:
  - get_execution_plan
  - get_query_text
  - get_wait_stats
  - get_table_indexes
---

# Skill: general_tuning

## Quando usar

Use quando o problema de performance do usuário não se encaixa em nenhuma técnica específica das outras skills (não há padrão claro de SELECT *, conversão implícita, key lookup, etc.).

## Instruções

Quando o problema de performance do usuário não se encaixa em uma técnica específica, conduza uma análise geral: colete o plano de execução da consulta, o texto da consulta, as estatísticas de espera do servidor e os índices existentes. Identifique os gargalos predominantes (waits, leituras lógicas, scans, lookups) e conclua com um plano de ação priorizado.
