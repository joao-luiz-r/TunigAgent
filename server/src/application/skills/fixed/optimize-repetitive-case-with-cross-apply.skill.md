---
name: optimize_repetitive_case_with_cross_apply
description: Detecta expressões CASE WHEN repetidas (ex: no SELECT e no WHERE) que são recalculadas múltiplas vezes para cada linha, causando redundância e sobrecarga de CPU. Recomenda o uso de CROSS APPLY para calcular a expressão uma única vez por linha e reutilizar o resultado em toda a consulta, melhorando performance e legibilidade.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - case repetido
  - cross apply para case
  - mesmo case no select e no where
  - calculo duplicado na consulta
  - usar cross apply
  - case calculado varias vezes
---

# Skill: optimize_repetitive_case_with_cross_apply

## Quando usar

Use quando uma consulta contiver uma expressão complexa (especialmente `CASE WHEN`) que aparece **repetidamente** em diferentes partes da consulta, como:

- No `SELECT` (para criar uma coluna calculada).
- No `WHERE` (para filtrar com base na mesma lógica).
- Em outras cláusulas como `GROUP BY`, `ORDER BY` ou `HAVING`.

O padrão comum (e problemático) é copiar e colar o bloco `CASE WHEN` várias vezes. Além de deixar o código difícil de manter (qualquer mudança na lógica precisa ser replicada em vários lugares), o SQL Server pode **recalcular a expressão múltiplas vezes para cada linha**, desperdiçando CPU e degradando a performance.

A solução é usar `CROSS APPLY` para criar uma "variável de linha" que calcula a expressão **uma única vez** por linha e disponibiliza o resultado via alias para toda a consulta, como se fosse uma coluna virtual.

## Instruções

Sua missão é identificar expressões repetidas (especialmente `CASE WHEN`) em uma consulta e reescrevê-las usando `CROSS APPLY` para evitar recálculos redundantes.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Analise a consulta:
   - Localize expressões que aparecem em múltiplos lugares (ex: no `SELECT`, no `WHERE`, no `GROUP BY`).
   - Verifique se a expressão é complexa ou envolve cálculos, subconsultas ou `CASE WHEN`.
4. Reescreva a consulta:
   - Adicione uma cláusula `CROSS APPLY` com uma subconsulta que calcula a expressão e a alias.
   - No `SELECT`, `WHERE` e demais cláusulas, substitua a expressão original pelo alias definido no `CROSS APPLY`.
   - Isso garante que a expressão seja calculada apenas uma vez por linha.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita para usar `CROSS APPLY`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes (ex: a expressão simplificada no `WHERE` agora permite Index Seek), mencione isso.
   - Se a consulta puder se beneficiar de novos índices para melhorar a performance da expressão ou do filtro, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Expressão `CASE WHEN` (ou cálculo) repetida no SELECT e no WHERE.

```sql
-- Exemplo extraído do PDF: Cálculo de faturamento líquido repetido
SELECT
    v.IdProduto,
    (v.PrecoUnitario * v.Quantidade) - v.ValorDesconto AS FaturamentoLiquido,
    ((v.PrecoUnitario * v.Quantidade) - v.ValorDesconto) * 0.05 AS ComissaoVendedor
FROM Vendas v
WHERE ((v.PrecoUnitario * v.Quantidade) - v.ValorDesconto) > 5000.00;
```

**Solução (DEPOIS):** Usar `CROSS APPLY` para calcular a expressão uma única vez.

```sql
-- Com CROSS APPLY, a expressão é calculada uma vez por linha e reutilizada
SELECT
    v.IdProduto,
    calc.FaturamentoLiquido,
    calc.FaturamentoLiquido * 0.05 AS ComissaoVendedor
FROM Vendas v
CROSS APPLY (
    SELECT (v.PrecoUnitario * v.Quantidade) - v.ValorDesconto
) AS calc(FaturamentoLiquido)
WHERE calc.FaturamentoLiquido > 5000.00;
```

**Motivo:** A abordagem original repete o cálculo do faturamento líquido três vezes na mesma consulta (duas vezes no `SELECT` e uma vez no `WHERE`). Para cada linha, o SQL Server recalcula a expressão cada vez que ela é referenciada, gerando desperdício de CPU e tornando o código mais difícil de manter. Com `CROSS APPLY`, o cálculo é feito **exatamente uma vez por linha** no momento da aplicação, e o resultado (alias `calc.FaturamentoLiquido`) é reutilizado em todo o restante da consulta. Isso melhora a performance, reduz a redundância e centraliza a lógica em um único ponto, facilitando manutenções futuras.

## Recomendação

- **Sempre** que uma expressão complexa (especialmente `CASE WHEN`) aparecer mais de uma vez na consulta, use `CROSS APPLY`.
- **Expanda para múltiplas expressões:** Você pode ter vários `CROSS APPLY` encadeados ou uma única subconsulta que calcula várias colunas derivadas:
  ```sql
  CROSS APPLY (
      SELECT
          (v.PrecoUnitario * v.Quantidade) - v.ValorDesconto AS FaturamentoLiquido,
          CASE WHEN ... END AS Categoria,
          ...
  ) AS calc
  ```
- **Use `CROSS APPLY` em vez de subconsultas no `SELECT`:** Quando você precisa de uma coluna calculada que depende da linha atual, `CROSS APPLY` é mais eficiente que uma subconsulta escalar (que pode executar linha a linha).
- **Cuidado com `NULL`:** O `CROSS APPLY` sempre retorna uma linha (como um `INNER JOIN`). Se a expressão puder retornar `NULL`, isso é perfeitamente aceitável.
- **Verifique a performance:** Após a reescrita, confira o plano de execução para garantir que o `CROSS APPLY` está sendo expandido como um `Compute Scalar` (cálculo direto) e não como um operador separado.
- **Índices:** Se a expressão simplificada no `WHERE` (ex: `calc.FaturamentoLiquido > 5000`) permitir o uso de um índice na tabela `Vendas`, considere criar um índice calculado ou um índice em colunas envolvidas. Se for o caso, emita o handoff para `create_assertive_index`.

---
**⚠️ Importante:** O `CROSS APPLY` não deve ser usado para substituir `JOIN`s entre tabelas – ele é especificamente para cálculos derivados linha a linha. Use com sabedoria para centralizar lógica e evitar repetição.