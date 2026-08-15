---
name: avoid_dynamic_search_condition
description: Detecta o padrão WHERE (@param IS NULL OR coluna = @param) que torna o predicado não-sargável, forçando Index Scan mesmo quando um valor específico é passado. Recomenda o uso de SQL dinâmico com sp_executesql ou a dica OPTION (RECOMPILE) para gerar planos otimizados por parâmetro.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - filtro opcional
  - dynamic search
  - is null or coluna
  - param is null
  - busca dinamica
  - filtros condicionais
  - parado com @param is null
---

# Skill: avoid_dynamic_search_condition

## Quando usar

Use quando uma consulta contiver filtros opcionais implementados com o padrão:

```sql
WHERE (@Param IS NULL OR Coluna = @Param)
```

Esse padrão é comum em telas de pesquisa ou relatórios, onde o usuário pode preencher ou não um filtro. No SQL Server, essa construção **destrói a SARGability**, pois o otimizador precisa gerar um plano único que atenda tanto o caso com parâmetro nulo (traz todas as linhas) quanto o caso com valor (filtra por uma coluna). Como o plano é genérico, o otimizador opta quase sempre por um **Index Scan** da tabela inteira, mesmo quando um valor específico é passado.

## Instruções

Sua missão é identificar esse padrão e reescrever a consulta de forma a permitir que o otimizador gere um plano eficiente para cada execução.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes da tabela envolvida com `get_table_indexes`.
3. Identifique a cláusula `WHERE` com o padrão `(@param IS NULL OR coluna = @param)`.
4. Avalie o contexto da consulta para escolher a melhor abordagem:
   - **Se for uma consulta frequente** (ex: telas de pesquisa com muitos acessos): recomende **SQL dinâmico com `sp_executesql`**, montando a cláusula `WHERE` apenas com os filtros que foram preenchidos. Isso evita recompilações desnecessárias e gera planos otimizados para cada combinação de filtros.
   - **Se for uma consulta pouco frequente** (ex: relatórios diários/semanais): recomende adicionar a dica **`OPTION (RECOMPILE)`** ao final da consulta. Isso força uma recompilação a cada execução, permitindo que o otimizador "enxergue" o valor real do parâmetro e gere um plano sob medida para aquele valor, com custo de recompilação aceitável.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reestruturação da consulta para eliminar o `OR` com parâmetro `NULL`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita (dinâmica ou com `OPTION (RECOMPILE)`) permitir o uso de um índice existente na coluna filtrada, indique isso.
   - Se a coluna filtrada não tiver um índice adequado, conclua a análise e acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Padrão `WHERE (@Param IS NULL OR Coluna = @Param)`, não-sargável, forçando Index Scan.

```sql
-- Exemplo: busca de clientes com filtro opcional por nome
DECLARE @Nome VARCHAR(100) = 'João';

SELECT Id, Email
FROM Clientes
WHERE (@Nome IS NULL OR Nome = @Nome);
```

**Solução (DEPOIS) – Opção 1: SQL Dinâmico com sp_executesql (recomendado para consultas frequentes)**

```sql
DECLARE @Nome VARCHAR(100) = 'João';
DECLARE @sql NVARCHAR(MAX) = N'SELECT Id, Email FROM Clientes WHERE 1=1';

IF @Nome IS NOT NULL
    SET @sql += N' AND Nome = @Nome';

EXEC sp_executesql @sql, N'@Nome VARCHAR(100)', @Nome;
```

**Solução (DEPOIS) – Opção 2: OPTION (RECOMPILE) (recomendado para consultas pouco frequentes)**

```sql
DECLARE @Nome VARCHAR(100) = 'João';

SELECT Id, Email
FROM Clientes
WHERE (@Nome IS NULL OR Nome = @Nome)
OPTION (RECOMPILE);
```

**Motivo:** No padrão original, o SQL Server compila um plano genérico que precisa funcionar para qualquer valor do parâmetro (inclusive `NULL`). Como o plano é fixo, o otimizador opta por uma estratégia segura (Index Scan) que não depende do valor real do parâmetro. Isso é ineficiente quando um filtro específico é passado, pois o banco poderia fazer um Index Seek.

- **SQL Dinâmico:** A query é montada com apenas os filtros preenchidos. Cada combinação de parâmetros gera um plano diferente, otimizado exatamente para aquela condição. O custo de compilação é pago apenas na primeira execução de cada combinação, sendo reutilizado posteriormente (se houver cache de planos).
- **OPTION (RECOMPILE):** Força a recompilação a cada execução, permitindo que o otimizador use o valor real do parâmetro para estimar a seletividade e escolher o melhor operador (Index Seek se a coluna tiver índice). É mais simples de implementar, mas o custo de recompilação pode ser alto se a consulta for executada muitas vezes por segundo.

## Recomendação

- **Para consultas frequentes** (ex: pesquisa em tela com muitos usuários): use **SQL dinâmico com `sp_executesql`** – evita recompilação excessiva e mantém eficiência.
- **Para consultas pouco frequentes** (ex: relatórios que rodam poucas vezes ao dia): use **`OPTION (RECOMPILE)`** – simples, eficaz e com overhead aceitável.
- **Sempre use `sp_executesql` com parâmetros** ao construir SQL dinâmico, **nunca** concatenando valores diretamente na string (previne injeção SQL e permite reuso do plano).
- **Verifique índices:** A coluna usada no filtro (ex: `Nome`) deve ter um índice para que o Index Seek seja possível. Se não houver, emita o handoff para `create_assertive_index` para avaliar a criação de um índice que beneficie a consulta.

---
**⚠️ Importante:** Este padrão é diferente de um `OR` comum entre duas colunas. Aqui o problema é o parâmetro `NULL`, que induz o otimizador a um plano genérico. As soluções apresentadas são específicas para filtros opcionais. Se houver múltiplos parâmetros opcionais, a abordagem dinâmica se torna ainda mais recomendada.