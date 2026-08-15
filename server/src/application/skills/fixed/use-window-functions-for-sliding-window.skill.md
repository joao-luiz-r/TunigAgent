---
name: use_window_functions_for_sliding_window
description: Detecta subconsultas complexas ou self-joins com múltiplas condições para calcular médias móveis, somas deslizantes ou outras agregações sobre janelas de linhas anteriores/posteriores, e recomenda substituir por funções de janela com ROWS BETWEEN, eliminando múltiplas leituras e reduzindo drasticamente o custo de CPU e I/O.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - media movel
  - moving average
  - janela deslizante
  - sliding window
  - somas deslizantes
  - rows between
---

# Skill: use_window_functions_for_sliding_window

## Quando usar

Use quando uma consulta precisar calcular uma **agregação sobre uma janela deslizante (sliding window)** dentro de um grupo ordenado, como por exemplo:

- Média móvel de vendas dos últimos 3 meses.
- Soma deslizante dos últimos 7 dias.
- Máximo dos últimos N pedidos de um cliente.
- Mínimo das últimas M transações.
- Desvio padrão de uma janela deslizante.

O padrão clássico (e ineficiente) para resolver isso é:

- Subconsulta correlacionada com `SUM()`, `AVG()`, `COUNT()` e condições de data `BETWEEN` ou `<=` e `>=`.
- Self-join com agregação e filtro de intervalo (ex: `WHERE data BETWEEN data_atual - N AND data_atual`).
- Uso de cursores ou loops para processar a janela linha a linha.

Essas abordagens são caras porque:

- A subconsulta correlacionada executa uma agregação separada para **cada linha** da tabela principal, com custo O(n * tamanho_da_janela).
- O self-join pode gerar um produto cartesiano filtrado, com múltiplas leituras da mesma tabela.
- Cursores processam linha a linha, com alto overhead de contexto.
- O código fica complexo e difícil de manter.

As Window Functions com `ROWS BETWEEN N PRECEDING AND M FOLLOWING` (ou `ROWS BETWEEN N PRECEDING AND CURRENT ROW`) resolvem o problema com **uma única passagem** pelos dados, de forma eficiente e com código muito mais limpo.

**⚠️ Atenção:** A cláusula `ROWS BETWEEN` com `PRECEDING` e `FOLLOWING` é fundamental para definir a janela deslizante. O padrão `RANGE` (sem especificação) tem penalidade significativa de performance e deve ser evitado.

## Instruções

Sua missão é identificar padrões de janela deslizante e reescrevê-los usando funções de janela com `ROWS BETWEEN`.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Identifique onde a consulta calcula uma agregação sobre um intervalo de linhas (ex: `WHERE data BETWEEN data_atual - 30 AND data_atual`).
4. Reescreva a consulta:
   - Utilize a função de agregação apropriada (`SUM`, `AVG`, `COUNT`, `MIN`, `MAX`) com `OVER` e `ROWS BETWEEN`.
   - Defina a janela com `ROWS BETWEEN N PRECEDING AND N FOLLOWING` (janela simétrica) ou `ROWS BETWEEN N PRECEDING AND CURRENT ROW` (incluindo apenas linhas anteriores e a atual).
   - Use `PARTITION BY` para reiniciar a janela por grupo.
   - Use `ORDER BY` para definir a ordenação (ex: por data, por sequência).
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita com funções de janela. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes (ex: índice composto nas colunas de `PARTITION BY` e `ORDER BY`), mencione isso.
   - Se faltar índices para otimizar a ordenação/partição, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Subconsulta correlacionada para calcular média móvel de 3 meses de vendas.

```sql
-- Calcular média móvel de vendas dos últimos 3 meses para cada produto
SELECT
    s1.ProductID,
    s1.OrderDate,
    s1.Quantity,
    (SELECT AVG(s2.Quantity)
     FROM Sales s2
     WHERE s2.ProductID = s1.ProductID
       AND s2.OrderDate >= DATEADD(MONTH, -3, s1.OrderDate)
       AND s2.OrderDate <= s1.OrderDate) AS MovingAvg3Months
FROM Sales s1
ORDER BY s1.ProductID, s1.OrderDate;
```

**Solução (DEPOIS):** Usar `AVG() OVER` com `ROWS BETWEEN N PRECEDING AND CURRENT ROW`.

```sql
-- Se os dados tiverem exatamente uma linha por mês, podemos usar ROWS BETWEEN
SELECT
    ProductID,
    OrderDate,
    Quantity,
    AVG(Quantity) OVER (
        PARTITION BY ProductID
        ORDER BY OrderDate
        ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) AS MovingAvg3Months
FROM Sales
ORDER BY ProductID, OrderDate;

-- Se os dados tiverem linhas irregulares (várias por mês) ou se quisermos janela exata por data,
-- precisamos usar RANGE ou uma abordagem alternativa com subconsulta.
-- Para a maioria dos casos, ROWS BETWEEN já é suficiente e mais eficiente.
```

**Motivo:** A subconsulta original executa um `AVG()` separado para cada linha da tabela `Sales`, com uma condição de data que varre as linhas dos últimos 3 meses. Isso resulta em custo O(n * tamanho_da_janela) e múltiplos acessos ao índice. O `AVG() OVER` com `ROWS BETWEEN 2 PRECEDING AND CURRENT ROW` faz uma única passagem pelos dados ordenados, calculando a média móvel de forma incremental, com custo O(n). O resultado é um plano com um único operador de *Window Aggregate*, sem *Nested Loops* ou subconsultas.

## Recomendação

- **Use `ROWS BETWEEN N PRECEDING AND CURRENT ROW`** para janelas que incluem a linha atual e N linhas anteriores (média móvel, soma móvel).
- **Use `ROWS BETWEEN N PRECEDING AND M FOLLOWING`** para janelas simétricas (ex: 3 linhas antes e 3 depois).
- **Use `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`** para totais acumulados (running total) – veja a skill correspondente.
- **Atenção com dados irregulares:** Se a janela for baseada em data (ex: últimos 30 dias) e você não tiver uma linha por dia, o `ROWS BETWEEN` pode não ser exato. Nesse caso, avalie se a janela baseada em linhas é aceitável ou se você precisa de uma abordagem com `RANGE` (que é mais lenta) ou com subconsulta.
- **Índices:** Para máxima performance, crie um índice composto com as colunas de `PARTITION BY` seguidas pelas colunas de `ORDER BY` (nessa ordem). Isso permite que o SQL Server evite o *Sort* e use um *Stream Aggregate* em vez de um *Window Aggregate* com *Sort*. Se não houver índice adequado, emita o handoff para `create_assertive_index`.
- **Alternativa com subconsulta:** Se a janela for baseada em data e você precisar de exatidão, pode ser necessário usar uma subconsulta, mas ela deve ser testada para verificar se o ganho de exatidão compensa a perda de performance.

---
**⚠️ Importante:** A janela deslizante é uma das aplicações mais poderosas e frequentemente subutilizadas das Window Functions. Ela substitui com vantagem subconsultas pesadas e self-joins, especialmente em análises de séries temporais, dashboards e relatórios financeiros.