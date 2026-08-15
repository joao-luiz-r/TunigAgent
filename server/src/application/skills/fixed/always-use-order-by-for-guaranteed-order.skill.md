---
name: always_use_order_by_for_guaranteed_order
description: Detecta consultas que dependem da ordem implícita dos resultados (ex: sem ORDER BY, com TOP 1, ou assumindo ordenação por índice) e recomenda a adição explícita de ORDER BY para garantir consistência, evitando comportamentos imprevisíveis devido a paralelismo, mudanças no plano de execução ou operadores como Hash Match.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - garantir a ordem dos resultados
  - order by explicito
  - ordem garantida
  - sem order by
  - ordenacao garantida
  - top 1 sem order by
---

# Skill: always_use_order_by_for_guaranteed_order

## Quando usar

Use quando uma consulta SQL **não contiver a cláusula `ORDER BY`**, mas a aplicação ou o usuário espera uma ordem específica nos resultados (ex: por data de inserção, por ID, ou por alguma coluna).

**O problema fundamental:** Em um banco de dados relacional, uma tabela é um **conjunto não ordenado** de linhas. A ordem dos resultados retornados por uma consulta sem `ORDER BY` é **arbitrária** e pode variar a cada execução devido a diversos fatores:

- **Paralelismo:** Quando o SQL Server usa múltiplos núcleos, cada núcleo pode ler partes diferentes da tabela, e a combinação dos resultados é imprevisível.
- **Operadores de plano:** Um `Hash Match` (usado em `JOIN`s ou `GROUP BY` em grandes volumes) não preserva ordem. `Merge Join` pode preservar, mas não há garantia.
- **Mudanças de plano:** O otimizador pode escolher um plano diferente a qualquer momento (ex: baseado em estatísticas atualizadas), alterando a ordem.
- **Order física vs lógica:** Mesmo que a tabela tenha um índice clustered (ordem física), o SQL Server pode ignorá-lo se julgar mais eficiente usar outro operador.

**Os riscos:**

- **Resultados inconsistentes:** A mesma consulta pode retornar linhas em ordens diferentes em momentos distintos, causando bugs intermitentes.
- **`TOP 1` sem `ORDER BY`:** Retorna uma linha arbitrária, não necessariamente a "primeira" ou a "mais recente".
- **`GROUP BY`:** Pode usar `Stream Aggregate` (ordenado) ou `Hash Match` (desordenado), alterando a ordem sem aviso.
- **Relatórios e exportações:** Dados desordenados podem ser mal interpretados ou causar problemas em processos downstream.

**A solução:** Sempre adicione `ORDER BY` explícito quando a ordem dos resultados importar. Isso força o SQL Server a ordenar o conjunto de resultados antes de retorná-lo, garantindo consistência e previsibilidade.

**⚠️ NÃO confunda com `avoid_unnecessary_order_by`:** esta skill é para consultas que **não têm** `ORDER BY` mas **precisam** de ordem garantida (adicionar `ORDER BY`). A skill `avoid_unnecessary_order_by` trata o caso **oposto**: consultas que **têm** `ORDER BY` mas **não precisam** dele no banco (a ordenação ocorreria na aplicação). Ao ver uma consulta que TRARIA colunas de outra tabela ou que ordena sem necessidade na fonte, NÃO adicione ORDER BY — acione `[SKILL_HANDOFF:avoid_unnecessary_order_by]`.

## Instruções

Sua missão é identificar consultas sem `ORDER BY` que podem se beneficiar da adição explícita, garantindo ordem previsível.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes` para verificar se um índice pode fornecer a ordenação desejada sem custo extra (ex: índice clustered na coluna de ordenação).
3. Analise a consulta:
   - Verifique se há `ORDER BY` na consulta. Se já houver, não se aplica.
   - Se não houver, identifique se a aplicação ou o usuário espera alguma ordem específica (ex: por data, por ID, por nome).
   - Preste atenção especial a `SELECT TOP N` ou `GROUP BY` que podem parecer ordenados, mas não têm garantia.
4. Reescreva a consulta:
   - Adicione `ORDER BY` com a(s) coluna(s) apropriada(s), em ordem ascendente (`ASC`) ou descendente (`DESC`).
   - Se houver `TOP N`, sempre adicione `ORDER BY` para que o "topo" seja definido de forma inequívoca.
   - Se o `GROUP BY` exigir ordenação, adicione `ORDER BY` após a cláusula `GROUP BY`.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da adição de `ORDER BY` para garantir ordem. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a adição de `ORDER BY` puder ser atendida por um índice existente (evitando um operador `Sort` no plano), mencione isso.
   - Se a ordenação desejada não tiver um índice que a suporte, e a consulta for crítica, considere criar um índice (ex: índice composto para cobrir a ordenação). Caso seja necessário, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Consulta sem ORDER BY, confiando em ordem implícita.

```sql
-- Exemplo 1: TOP 1 sem ORDER BY (resultado arbitrário)
SELECT TOP 1 [coluna_aleatoria] FROM [MinhaTabela];

-- Exemplo 2: SELECT sem ORDER BY (ordem não garantida)
SELECT Id, Nome, DataCriacao FROM Clientes;

-- Exemplo 3: GROUP BY sem ORDER BY (pode usar Hash Match, ordem imprevisível)
SELECT Status, COUNT(*) AS Total
FROM Pedidos
GROUP BY Status;
```

**Solução (DEPOIS):** Adicionar ORDER BY explícito.

```sql
-- Exemplo 1 corrigido: TOP 1 com ORDER BY
SELECT TOP 1 [coluna_aleatoria]
FROM [MinhaTabela]
ORDER BY [coluna_de_ordem_correta] DESC;  -- Ex: pelo ID mais recente

-- Exemplo 2 corrigido: SELECT com ORDER BY
SELECT Id, Nome, DataCriacao
FROM Clientes
ORDER BY DataCriacao DESC, Nome ASC;  -- Ordenação definida

-- Exemplo 3 corrigido: GROUP BY com ORDER BY
SELECT Status, COUNT(*) AS Total
FROM Pedidos
GROUP BY Status
ORDER BY Total DESC;  -- Ordena por total, ou por Status
```

**Motivo:** A ausência de `ORDER BY` deixa a ordenação a critério do otimizador, que pode escolher diferentes planos (ex: `Table Scan`, `Index Scan`, `Hash Match`, `Nested Loops`, com ou sem paralelismo) que resultam em ordens diferentes. Ao adicionar `ORDER BY`, você instrui o SQL Server a ordenar os resultados explicitamente, garantindo que a ordem seja consistente entre execuções, independentemente de mudanças no plano ou no volume de dados.

**Benefícios:**

- **Previsibilidade:** A aplicação sempre recebe os dados na ordem esperada.
- **Consistência:** Resultados idênticos para a mesma consulta, mesmo após atualizações de estatísticas ou mudanças no plano.
- **Correção:** `TOP N` retorna as linhas corretas com base na ordenação definida.
- **Clareza:** O código comunica claramente qual é a ordem desejada para quem lê.

## Recomendação

- **Regra de ouro:** Se a ordem dos resultados importa, sempre use `ORDER BY`. A menos que a ordem seja absolutamente irrelevante (ex: para uma consulta de validação que só verifica existência), sempre adicione.
- **`TOP N`:** Sempre acompanhe `TOP N` com `ORDER BY` para definir o que é "topo". Exemplo: `SELECT TOP 10 * FROM Pedidos ORDER BY DataPedido DESC`.
- **`GROUP BY`:** Se a ordem das linhas agregadas for relevante, adicione `ORDER BY` após `GROUP BY`. O `ORDER BY` pode referenciar colunas do `SELECT` (ex: `ORDER BY Total DESC`).
- **Índices:** Para evitar custo extra de ordenação (`Sort` no plano), tente criar índices que cubram a(s) coluna(s) de `ORDER BY` na ordem correta (ex: índice em `DataCriacao DESC`). Se a consulta for crítica e não houver índice, emita o handoff para `create_assertive_index`.
- **Plano de execução:** Verifique se o operador `Sort` aparece no plano. Se aparecer e a consulta for pesada, considere um índice para eliminá-lo (ou aceite o custo se for aceitável).
- **Performance vs consistência:** Embora o `ORDER BY` possa adicionar custo (especialmente em grandes conjuntos), é o preço a pagar pela consistência. Em muitos casos, um índice adequado torna a ordenação muito eficiente.

---
**⚠️ Importante:** Confiar na ordem implícita é uma fonte clássica de bugs intermitentes e difíceis de reproduzir. Nunca assuma que o SQL Server "sempre" retorna na ordem de inserção ou na ordem do índice. A única garantia é o `ORDER BY` explícito.