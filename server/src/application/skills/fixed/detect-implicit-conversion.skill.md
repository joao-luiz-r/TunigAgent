---
name: detect_implicit_conversion
description: Detecta comparações entre colunas e valores de tipos diferentes (conversões implícitas) em predicados WHERE/JOIN, que forçam a conversão da coluna e impedem o uso de índices. Recomenda alinhar os tipos convertendo o valor (nunca a coluna) para permitir Index Seek.
tools:
  - get_query_text
  - get_execution_plan
  - get_table_indexes
  - get_table_schema
keywords:
  - conversao implicita
  - implicit conversion
  - convert_implicit
  - varchar nvarchar
  - tipos de dados diferentes
  - mismatch de tipos
  - conversao de tipo
---

# Skill: detect_implicit_conversion

## Quando usar

Use quando uma coluna com índice (ou que poderia usar um índice) for comparada com um valor, variável ou parâmetro de um **tipo de dados diferente**, ou quando o plano de execução mostra `CONVERT_IMPLICIT`. As conversões implícitas ocorrem quando os tipos não coincidem e o SQL Server precisa converter um dos lados para efetuar a comparação.

Exemplos comuns de mismatch:

- `DATE` → `VARCHAR`
- `INT` → `BIGINT`
- `NVARCHAR` → `VARCHAR`
- `DATE` → `DATETIME`

Nesses casos, a conversão geralmente é aplicada **sobre a coluna** (lado esquerdo) por questões de precedência de tipos, o que torna o predicado não‑sargável e impede o uso de um *Index Seek*, forçando um *Index Scan*.

## Instruções

Sua missão é identificar conversões implícitas em predicados de `WHERE` (e também em `JOIN`), reescrevendo a comparação para que o tipo do **valor** (lado direito) seja explicitamente convertido para o tipo da **coluna** (lado esquerdo), ou ajustando a literal para que coincida com o tipo da coluna sem necessidade de conversão. O texto da consulta e o plano de execução (operador `CONVERT_IMPLICIT`) são suas principais evidências.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes da tabela envolvida com `get_table_indexes`.
3. Se disponível, confirme a conversão no plano de execução com `get_execution_plan` (operador `CONVERT_IMPLICIT`).
4. Identifique a coluna sendo comparada e verifique seu tipo de dados.
5. Identifique o tipo do valor, variável ou parâmetro do outro lado da comparação.
6. Se houver mismatch:
   - **Regra de ouro:** Nunca converta a coluna. Converta o **valor** para o tipo da coluna.
   - Utilize `CAST` ou `CONVERT` explícito no lado direito (ex: `CAST(@var AS INT)`, `CONVERT(DATETIME, '2023-01-01', 121)`).
   - Ou altere a literal diretamente (ex: remover aspas se a coluna for `INT` e o valor for numérico, ou adicionar aspas se a coluna for `VARCHAR`).
7. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da correção do predicado para eliminar a conversão implícita. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se o ajuste revelar que um índice já existente pode ser usado, explique isso na resposta.
   - Se a coluna não possuir um índice adequado e a consulta puder se beneficiar de um, conclua a análise e acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Comparação entre tipos diferentes, forçando a conversão da coluna e invalidando o índice.

```sql
-- Exemplo 1: Coluna VARCHAR comparada com parâmetro NVARCHAR
DECLARE @uf NVARCHAR(2) = 'SP';
SELECT * FROM Clientes WHERE Uf = @uf;

-- Exemplo 2: Coluna VARCHAR(10) comparada com INT (sem aspas)
SELECT * FROM Pedidos WHERE CodigoVarchar = 1001;

-- Exemplo 3: Coluna DATETIME comparada com VARCHAR ambíguo
SELECT * FROM Eventos WHERE DataHora = '01/01/2023';
```

**Solução (DEPOIS):** Ajustar o valor para o tipo exato da coluna.

```sql
-- Exemplo 1 corrigido: converter o parâmetro para o tipo da coluna
DECLARE @uf NVARCHAR(2) = 'SP';
SELECT * FROM Clientes WHERE Uf = CAST(@uf AS VARCHAR(2));

-- Exemplo 2 corrigido: comparação entre VARCHAR e VARCHAR
SELECT * FROM Pedidos WHERE CodigoVarchar = '1001';

-- Exemplo 3 corrigido: conversão explícita do valor, formato ISO
SELECT * FROM Eventos WHERE DataHora = CAST('2023-01-01' AS DATETIME);
```

**Motivo:** Em operações de comparação, o SQL Server segue uma ordem de precedência de tipos de dados. Quando os tipos diferem, o tipo com menor precedência é convertido para o de maior precedência. Infelizmente, a coluna frequentemente possui o tipo de menor precedência (ex: `VARCHAR` tem precedência menor que `INT`; `DATE` tem precedência menor que `DATETIME`). Isso força a conversão de **todos os valores da coluna** antes da comparação, tornando o uso de índice impossível. Ao converter o **valor** (lado direito) para o tipo da coluna, eliminamos a conversão em massa e restauramos a sargabilidade.

## Recomendação

- **Sempre** verifique os tipos de dados das colunas envolvidas em cláusulas `WHERE`, `JOIN` e `HAVING`.
- Consulte a tabela de conversões implícitas para antecipar possíveis problemas (ex: `DATE`→`VARCHAR`, `INT`→`BIGINT`, `NVARCHAR`→`VARCHAR`, `DATE`→`DATETIME`).
- Ao passar parâmetros para consultas dinâmicas ou procedimentos armazenados, garanta que os parâmetros sejam declarados com o mesmo tipo da coluna (ex: se a coluna é `VARCHAR(10)`, o parâmetro deve ser `VARCHAR(10)`, não `NVARCHAR(100)`).
- Para literais de data, **sempre** use o formato `YYYY-MM-DD` ou `YYYYMMDD` (estilos `121` ou `112` do `CONVERT`), que são inequívocos para `DATETIME` e `DATE`.
- Após a correção, valide com os índices existentes. Se a consulta agora puder usar um *Index Seek* mas não houver índice na coluna, emita o handoff para `create_assertive_index`.

---
**⚠️ Importante:** Conversões implícitas entre `NVARCHAR` e `VARCHAR` também ocorrem e são particularmente perigosas, pois podem envolver diferenças de *collation* e gerar *scans*. Sempre prefira o tipo adequado ao armazenamento (`VARCHAR` para dados ASCII/ANSI, `NVARCHAR` para Unicode) e mantenha consistência entre colunas e parâmetros.