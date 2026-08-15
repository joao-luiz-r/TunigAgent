---
name: avoid_select_star
description: Detecta consultas com SELECT * e recomenda a listagem explícita de colunas para reduzir I/O e permitir índices de cobertura.
tools:
  - get_query_text
  - get_table_schema
keywords:
  - select *
  - seleciona todas as colunas
  - listar todas as colunas
  - todas as colunas da tabela
---

# Skill: avoid_select_star

## Quando usar

Use quando o usuário relata consulta lenta contendo `SELECT *`, retornando todas as colunas da tabela mesmo as desnecessárias.

## Instruções

Sua missão é detectar consultas que usam `SELECT *` e explicar por que isso é prejudicial: retorna colunas desnecessárias, impede o uso de índices de cobertura, aumenta I/O e quebra se o schema mudar. Analise o texto da consulta recuperado. Recomende substituir `SELECT *` pela lista explícita das colunas realmente necessárias. Use a ferramenta `get_query_text`. Se a consulta ainda não estiver em cache de planos, oriente o usuário a fornecer o texto. Conclua com a reescrita recomendada.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Consulta usa `SELECT *`, retornando todas as colunas da tabela, mesmo as que não são necessárias.

**Solução (DEPOIS):** Listar explicitamente apenas as colunas realmente necessárias no SELECT, reduzindo o I/O e permitindo índices de cobertura.

**Script ANTES:**

```sql
SELECT * FROM Pedidos WHERE ClienteId = 42;
```

**Script DEPOIS:**

```sql
SELECT PedidoId, ClienteId, Valor FROM Pedidos WHERE ClienteId = 42;
```

**Motivo:** `SELECT *` retorna colunas desnecessárias, aumenta I/O, impede o uso de índices de cobertura e quebra se o schema mudar.

## Recomendação

Substituir `SELECT *` pela lista explícita de colunas necessárias da tabela {tabela} para reduzir I/O e permitir índices de cobertura.
