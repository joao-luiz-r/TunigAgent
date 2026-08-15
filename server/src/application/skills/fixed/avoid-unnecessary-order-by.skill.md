---
name: avoid_unnecessary_order_by
description: Detecta o uso desnecessário de ORDER BY em consultas que não exigem ordenação no banco de dados, recomendando a remoção para reduzir custos de CPU, I/O e memória, especialmente quando a ordenação pode ser feita na camada de aplicação.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - order by desnecessario
  - ordenacao na aplicacao
  - ordenar na aplicacao
  - sem necessidade de order by
  - remover order by
  - order by desnecessaria
---

# Skill: avoid_unnecessary_order_by

## Quando usar

Use quando uma consulta contiver uma cláusula `ORDER BY` que **não** é estritamente necessária para a lógica do negócio no momento da execução no banco de dados, especialmente:

- Quando o resultado final será exibido em uma interface onde a ordenação pode ser feita pela aplicação (front-end, relatório, etc.).
- Quando o `ORDER BY` é usado apenas para fins de depuração ou visualização temporária.
- Quando a consulta faz parte de um processo ETL ou de geração de dados onde a ordem não importa para a próxima etapa.

Nesses casos, a ordenação no banco de dados força o SQL Server a utilizar operadores de *Sort* (em memória ou em tempdb), que consomem CPU, memória e podem causar derramamento para o disco (`tempdb`), degradando significativamente a performance, principalmente em grandes volumes de dados.

**⚠️ NÃO confunda com `always_use_order_by_for_guaranteed_order`:** esta skill é para consultas que **têm** `ORDER BY` mas **não precisam** dele (a ordenação pode ficar na aplicação). A skill `always_use_order_by_for_guaranteed_order` trata o caso **oposto**: consultas que **não têm** `ORDER BY` mas **precisam** de ordem garantida (ex: `TOP 1` arbitrário, dependência de ordem implícita). Ao ver uma consulta sem `ORDER BY` em que a ordem importa, NÃO remova nada — acione `[SKILL_HANDOFF:always_use_order_by_for_guaranteed_order]`.

## Instruções

Sua missão é identificar consultas com `ORDER BY` desnecessário e recomendar sua remoção, ou, quando a ordenação for realmente necessária, sugerir alternativas para otimizar o custo.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes da tabela envolvida com `get_table_indexes`.
3. Analise o contexto da consulta:
   - A ordem é exigida pelo requisito funcional (ex: relatório final, paginação, ranking)?
   - Se sim, a ordenação pode ser feita de forma mais eficiente (ex: usando um índice que já mantenha a ordem, ou usando `ORDER BY` na coluna do índice clusterizado)?
   - Se não, a ordenação pode ser removida sem impacto no resultado.
4. Se a ordenação for desnecessária:
   - Sugira a remoção da cláusula `ORDER BY`.
   - Documente a justificativa: redução de custo de CPU, memória e tempdb.
5. Se a ordenação for necessária:
   - Verifique se há um índice que já mantém a ordem das colunas do `ORDER BY`. Se sim, o `ORDER BY` pode ser satisfeito sem um operador de *Sort* explícito (o índice já fornece a ordem).
   - Se não houver índice, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]` para avaliar a criação de um índice que beneficie o `ORDER BY`.
6. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da análise do `ORDER BY`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`), a menos que seja via handoff.
   - Se a ordenação for necessária e faltar um índice apropriado, emita o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Uso desnecessário de `ORDER BY` que causa custo extra de ordenação.

```sql
-- Exemplo adaptado do PDF: Consulta que popula tabelas temporárias com ORDER BY
-- desnecessário, pois a ordenação poderia ser feita apenas no final.
SELECT nm_endereco, nm_bairro, nm_cidade
INTO #rio
FROM corp_endereco
WHERE nm_cidade = 'Rio de Janeiro'
ORDER BY bairro;

SELECT nm_endereco, nm_bairro, nm_cidade
INTO #sampa
FROM corp_endereco
WHERE nm_cidade = 'São Paulo'
ORDER BY bairro;

-- Depois as tabelas são unidas e ordenadas novamente
SELECT nm_endereco, nm_bairro, nm_cidade
FROM #rio
UNION
SELECT nm_endereco, nm_bairro, nm_cidade
FROM #sampa
ORDER BY bairro;
```

**Solução (DEPOIS):** Remover o `ORDER BY` dos `SELECT` que populam as tabelas temporárias, mantendo apenas o `ORDER BY` final (se necessário).

```sql
-- Removendo ORDER BY desnecessário nas tabelas temporárias
SELECT nm_endereco, nm_bairro, nm_cidade
INTO #rio
FROM corp_endereco
WHERE nm_cidade = 'Rio de Janeiro';

SELECT nm_endereco, nm_bairro, nm_cidade
INTO #sampa
FROM corp_endereco
WHERE nm_cidade = 'São Paulo';

-- Mantendo apenas o ORDER BY final, que ainda pode ser otimizado se houver índice
SELECT nm_endereco, nm_bairro, nm_cidade
FROM #rio
UNION
SELECT nm_endereco, nm_bairro, nm_cidade
FROM #sampa
ORDER BY bairro;
```

**Motivo:** O `ORDER BY` força o SQL Server a classificar os dados antes de inseri-los na tabela temporária. Isso gera custo de CPU e I/O. No exemplo, a ordenação é feita duas vezes (em cada `SELECT INTO`) e depois novamente no `UNION final, totalizando três operações de *Sort*. Removendo os `ORDER BY` intermediários, eliminamos o custo desnecessário e melhoramos a performance da carga das tabelas temporárias.

## Recomendação

- **Sempre** questione a necessidade do `ORDER BY` na consulta SQL. A ordenação pode ser realizada na camada de aplicação com menos custo, especialmente para interfaces de usuário com paginação.
- Se o `ORDER BY` for realmente necessário, use-o em uma coluna que já tenha um índice clusterizado ou non-clustered que mantenha a ordem. Isso evita o operador de *Sort* e usa um *Index Scan* ordenado, que é mais eficiente.
- Evite `ORDER BY` em colunas calculadas ou com funções, a menos que seja absolutamente necessário.
- Para consultas que geram dados intermediários (tabelas temporárias, CTEs, subconsultas), remova o `ORDER BY` a menos que a ordem seja estritamente necessária para a próxima etapa (ex: quando se usa `ROW_NUMBER()` com `ORDER BY` para ranking, aí é necessário).
- Ao identificar um `ORDER BY` necessário e que não é suportado por um índice, emita o handoff para `create_assertive_index` para avaliar a criação de um índice que cubra a ordenação.

---
**⚠️ Importante:** Em muitos casos, o `ORDER BY` é um hábito trazido de outras ferramentas (como Excel) e não é realmente necessário no banco de dados. Remover esses `ORDER BY` pode trazer ganhos significativos de performance, especialmente em consultas de grande volume.