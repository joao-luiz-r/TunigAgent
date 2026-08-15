---
name: avoid_large_temp_tables
description: Detecta criação de tabelas temporárias (#tabela) com grande volume de dados ou sem filtragem adequada, que consomem recursos do tempdb, afetam a própria query e prejudicam outras sessões. Recomenda filtrar dados o mais cedo possível, selecionar apenas colunas necessárias e, se necessário, criar índices nas tabelas temporárias para otimizar operações subsequentes.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - tabela temporaria grande
  - grande volume de dados
  - tempdb lotado
  - lota o tempdb
  - tabela com volume alto
  - grande tabela temporaria
---

# Skill: avoid_large_temp_tables

## Quando usar

Use quando uma consulta criar uma **tabela temporária (#tabela)** com um grande volume de dados, sem filtros adequados ou com `SELECT *` que traz colunas desnecessárias. Isso é comum em:

- Procedimentos que usam tabelas temporárias para processamento intermediário.
- Queries que inserem milhões de linhas em tabelas temporárias sem necessidade.
- Código que popula a temporária com todos os dados e depois filtra, em vez de filtrar antes.
- Uso de `SELECT * INTO #Temp` sem restrições.

**O problema:** Tabelas temporárias residem no **tempdb**, um banco de dados de sistema compartilhado por todas as sessões. Quando uma tabela temporária cresce muito, ela consome recursos críticos:

- **Espaço e I/O:** Escrita e leitura intensiva no tempdb, criando gargalos de I/O para todo o servidor.
- **CPU:** Inserções, atualizações e consultas sobre grandes temporárias consomem CPU.
- **Memória:** Grandes temporárias disputam o buffer pool, forçando outras queries a usar disco.
- **Contenção:** Em cenários de alta concorrência, podem causar latches em páginas de alocação do tempdb, impactando todas as sessões.

**Impacto coletivo:** Uma tabela temporária gigante não afeta apenas sua query, mas prejudica a performance de **todas as outras queries** que dependem do tempdb.

**⚠️ NÃO confunda com `choose_temp_table_or_table_variable`:** esta skill otimiza a **população/volume** de uma `#tabela` já existente (filtrar cedo, evitar `SELECT *`). A skill `choose_temp_table_or_table_variable` decide **entre** `@tabela` e `#tabela` (troca a estrutura). Se o problema for qual objeto temporário usar, acione `[SKILL_HANDOFF:choose_temp_table_or_table_variable]`; se já é uma temporária grande e mal populada, siga com esta skill.

**A solução:** Trate tabelas temporárias como tabelas reais – seja seletivo, filtre o mais cedo possível, selecione apenas colunas necessárias, e considere criar índices para operações subsequentes.

## Instruções

Sua missão é identificar consultas que criam tabelas temporárias com grande volume de dados e recomendar otimizações para reduzir seu tamanho e impacto.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Identifique a criação de tabelas temporárias:
   - `SELECT * INTO #Temp FROM ...`
   - `INSERT INTO #Temp SELECT * FROM ...`
   - `CREATE TABLE #Temp ... INSERT INTO #Temp SELECT ...`
4. Analise a query de população:
   - Há filtros (`WHERE`) aplicados antes de inserir na temporária?
   - Há `SELECT *` ou apenas colunas necessárias?
   - A tabela temporária será usada em `JOIN`s ou `WHERE` com filtros adicionais?
5. Reescreva a consulta:
   - **Filtre o mais cedo possível:** Aplique `WHERE` na consulta que popula a temporária, não depois.
   - **Selecione apenas colunas necessárias:** Substitua `SELECT *` pela lista explícita de colunas que serão usadas.
   - **Considere criar índices:** Após popular a temporária, crie índices nas colunas usadas em `JOIN`, `WHERE` ou `ORDER BY` para acelerar operações subsequentes.
6. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da otimização de tabelas temporárias. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice em tabelas permanentes (`CREATE INDEX`).
   - Para recomendações de índices em tabelas temporárias, você pode sugerir a criação de índices na própria temporária (ex: `CREATE INDEX IX_Temp ON #Temp(coluna)`), mas isso é considerado parte da reescrita e não um handoff para `create_assertive_index` (que trata índices permanentes).
   - NUNCA emita um script `CREATE INDEX` em tabelas permanentes diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Tabela temporária populada com todos os dados e colunas, causando alto consumo de recursos.

```sql
-- Tabela temporária mal projetada: traz todas as colunas e todos os registros
SELECT *
INTO #PedidosTemp
FROM Pedidos;  -- Sem filtro, milhões de linhas

-- Depois filtra (já tarde)
SELECT ID_Pedido, DataPedido, Status
FROM #PedidosTemp
WHERE DataPedido = '2025-01-01';
```

**Solução (DEPOIS):** Filtrar e selecionar colunas antes de inserir na temporária.

```sql
-- Tabela temporária otimizada: apenas colunas e linhas necessárias
SELECT ID_Pedido, DataPedido, Status
INTO #PedidosTemp
FROM Pedidos
WHERE DataPedido = '2025-01-01';  -- Filtra na origem

-- Agora a temporária é pequena e as operações subsequentes são rápidas
SELECT * FROM #PedidosTemp;

-- Se necessário, crie índices na temporária para JOINs ou buscas adicionais
CREATE INDEX IX_Temp_Data ON #PedidosTemp(DataPedido);
```

**Motivo:** A abordagem original carrega milhões de linhas e todas as colunas para o tempdb, consumindo espaço, I/O, CPU e memória. Em seguida, a consulta filtra, mas já pagou o custo de processar todos os dados. A versão otimizada aplica o filtro `WHERE` **antes** de inserir, reduzindo drasticamente o volume de dados na temporária, e seleciona apenas as colunas necessárias, reduzindo I/O e memória. Se a temporária for usada em `JOIN`s ou buscas adicionais, um índice criado nela acelera essas operações sem sobrecarregar o tempdb desnecessariamente.

## Recomendação

- **Filtre o mais cedo possível:** Aplique `WHERE` na consulta de origem antes de inserir na temporária. Não traga dados que serão descartados depois.
- **Selecione apenas colunas necessárias:** Evite `SELECT *` – liste explicitamente as colunas que serão usadas nas etapas seguintes.
- **Crie índices na temporária:** Se a temporária for usada em `JOIN`s, `WHERE` ou `ORDER BY`, crie índices nela imediatamente após a população:
  ```sql
  CREATE INDEX IX_Temp_Coluna ON #Temp(Coluna);
  ```
- **Monitore o tempdb:** Use DMVs como `sys.dm_db_file_space_usage` e `sys.dm_db_session_space_usage` para monitorar o espaço usado por tabelas temporárias.
- **Considere alternativas:** Se os dados forem muito grandes, avalie se uma tabela temporária é realmente necessária ou se um `CTE` ou subconsulta poderia resolver sem criar uma estrutura física.
- **Pense no coletivo:** Lembre-se de que o tempdb é compartilhado. Uma temporária gigante pode prejudicar outras queries – seja responsável.

---
**⚠️ Importante:** Tabelas temporárias são ferramentas poderosas, mas seu uso indiscriminado pode transformá-las em um pesadelo de performance. Trate cada temporária como se fosse uma tabela de produção – seja seletivo, filtre e indexe adequadamente. O benefício é duplo: sua query roda mais rápido e o servidor como um todo permanece saudável.