---
name: avoid_wildcard_prefix
description: Detecta consultas com LIKE começando com curinga (LIKE '%texto') que impedem o uso de índice, e recomenda alternativas.
tools:
  - get_query_text
---

# Skill: avoid_wildcard_prefix

## Quando usar

Use quando um predicado `LIKE` começa com curinga (`LIKE '%abc'` ou `LIKE '%abc%'`), tornando a busca não-sargável e forçando scan.

## Instruções

Sua missão é identificar predicados LIKE com curinga no início (ex: `LIKE '%abc'`, `LIKE '%abc%'`) que tornam o predicado não-sargável e forçam scan. Quando a busca por prefixo for suficiente, use `LIKE 'abc%'` (sargável). Se o curinga inicial for realmente necessário, recomende usar busca por texto completo (FULLTEXT) ou avaliar o custo. Analise o texto da consulta recuperado e conclua com a reescrita recomendada.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Predicado `LIKE` com curinga no início (`LIKE '%texto'`) impede o uso de índice de prefixo.

**Solução (DEPOIS):** Usar prefixo fixo (`LIKE 'texto%'`) quando possível, ou adotar FULLTEXT quando a busca livre for indispensável.

**Script ANTES:**

```sql
SELECT * FROM Clientes WHERE Nome LIKE '%Silva%';
```

**Script DEPOIS:**

```sql
SELECT * FROM Clientes WHERE Nome LIKE 'Silva%'; -- sargável (ou FULLTEXT para busca no meio)
```

**Motivo:** Curinga no início faz o SQL Server varrer o índice inteiro; com prefixo fixo o índice é usado em Index Seek.

## Recomendação

Substituir o LIKE {padrao} por {alternativa}: quando o prefixo for fixo, usar {novo_padrao}; quando o curinga inicial for essencial, avaliar FULLTEXT.
