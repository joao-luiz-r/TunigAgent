---
name: detect_implicit_conversion
description: Detecta conversões implícitas em predicados WHERE/JOIN, quando uma coluna é comparada com um valor ou parâmetro de tipo diferente, impedindo o uso de índices.
tools:
  - get_query_text
  - get_execution_plan
---

# Skill: detect_implicit_conversion

## Quando usar

Use quando o plano de execução mostra `CONVERT_IMPLICIT` ou quando uma coluna é comparada a um valor de tipo distinto (VARCHAR vs NVARCHAR, INT vs string) e o índice não é usado.

## Instruções

Sua missão é identificar conversões implícitas de tipo em comparações de colunas (WHERE e JOIN). O texto da consulta e o plano de execução (operador `CONVERT_IMPLICIT`) são suas principais evidências. Quando uma coluna é comparada a um valor de tipo distinto, recomende alinhar os tipos com `CAST`/`CONVERT` no lado do valor (nunca na coluna), ou ajustar a declaração do parâmetro. Use as ferramentas `get_query_text` e `get_execution_plan`. Conclua com a correção recomendada.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Coluna VARCHAR é comparada a um parâmetro/valor NVARCHAR (ou INT comparado a string), gerando `CONVERT_IMPLICIT`.

**Solução (DEPOIS):** Alinhar os tipos fazendo `CAST`/`CONVERT` no lado do valor (nunca na coluna), permitindo o uso do índice.

**Script ANTES:**

```sql
DECLARE @uf NVARCHAR(2) = 'SP';
SELECT * FROM Clientes WHERE Uf = @uf;
```

**Script DEPOIS:**

```sql
DECLARE @uf NVARCHAR(2) = 'SP';
SELECT * FROM Clientes WHERE Uf = CAST(@uf AS VARCHAR(2));
```

**Motivo:** Conversão implícita na coluna torna o predicado não-sargável, impedindo o seek no índice e forçando scan.

## Recomendação

Corrigir a conversão implícita na comparação de {coluna}: aplicar `CAST`/`CONVERT` no valor comparado para que o tipo coincida com o da coluna, permitindo o uso de índice.
