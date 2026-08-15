---
name: ensure_scalar_udf_inlining
description: Detecta funções escalares (Scalar UDFs) que podem estar impedindo o inlining automático do SQL Server 2019+, prejudicando a performance com execução linha a linha (RBAR). Recomenda verificar a coluna is_inlineable em sys.sql_modules e, se necessário, reescrever a lógica como Inline Table-Valued Function (iTVF) para garantir que o otimizador possa expandi-la no plano da consulta.
tools:
  - get_query_text
  - get_table_indexes
  - get_object_metadata
keywords:
  - scalar udf
  - udf escalar
  - inlining
  - is_inlineable
  - funcao escalar lenta
  - inlineable
  - udf lenta
---

# Skill: ensure_scalar_udf_inlining

## Quando usar

Use quando uma consulta (ou procedimento) referencia uma **função escalar definida pelo usuário (Scalar UDF)** em uma coluna calculada, cláusula WHERE, ou JOIN. Exemplos:

- `SELECT dbo.CalculaImposto(Valor) FROM Vendas`
- `WHERE dbo.FormataData(DataVenda) = '2026-01-01'`

Historicamente, Scalar UDFs são vilãs de performance porque executam **linha a linha (RBAR – Row-By-Agonizing-Row)**, sem que o otimizador consiga integrá-las ao plano principal.

O **SQL Server 2019** introduziu o **Scalar UDF Inlining**, que transforma a função em uma expressão relacional automaticamente, permitindo que o otimizador a integre ao plano como se fosse uma subconsulta. Porém, há várias restrições que **desabilitam o inlining sem aviso explícito**, fazendo com que a função continue rodando linha a linha.

Esta skill deve ser usada para:

1. Identificar o uso de Scalar UDFs na consulta.
2. Verificar se a função é inlineável ou não.
3. Se não for inlineável, recomendar a reescrita como **Inline Table-Valued Function (iTVF)**, que é sempre expansível e nunca executa RBAR.

## Instruções

Sua missão é detectar Scalar UDFs em consultas e, quando necessário, orientar a reescrita para garantir performance.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Identifique todas as chamadas de funções escalares na consulta (ex: `dbo.MinhaFuncao`).
4. Para cada função identificada, colete os metadados com `get_object_metadata` (tipo, `is_inlineable`, `is_schema_bound` e definição via `sys.sql_modules`).

5. Avalie o resultado:
   - Se `is_inlineable = 1`: a função pode ser inlineada. Apenas documente que o SQL Server pode otimizá-la.
   - Se `is_inlineable = 0`: a função **não pode ser inlineada** devido a alguma restrição (uso de variáveis locais, cursores, chamadas a outras funções não inlineáveis, etc.). Nesse caso, a função executará linha a linha e deve ser reescrita.
6. Se `is_inlineable = 0` (ou se a função não existir e você precisar criar uma nova), recomende reescrever a lógica como uma **Inline Table-Valued Function (iTVF)**:
   - A iTVF retorna uma tabela de uma linha e uma coluna, e pode ser acessada via `CROSS APPLY` ou `OUTER APPLY`.
   - Isso garante que o otimizador expanda a lógica no plano principal, eliminando RBAR.
7. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da análise e reescrita de Scalar UDFs. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita como iTVF permitir o uso de índices existentes, mencione isso.
   - Se a lógica da função envolver acesso a tabelas que precisam de índices para performance, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Scalar UDF que não é inlineável, executando linha a linha (RBAR).

```sql
-- Exemplo: Função escalar que calcula um valor com base em uma tabela
CREATE FUNCTION dbo.CalculaDesconto (@Preco DECIMAL(10,2), @Categoria INT)
RETURNS DECIMAL(10,2)
AS
BEGIN
    DECLARE @Desconto DECIMAL(10,2);
    SELECT @Desconto = CASE
        WHEN @Categoria = 1 THEN @Preco * 0.1
        WHEN @Categoria = 2 THEN @Preco * 0.2
        ELSE @Preco * 0.05
    END;
    RETURN @Desconto;
END;
GO

-- Uso da função em uma consulta (causa RBAR)
SELECT IdProduto, Preco, dbo.CalculaDesconto(Preco, Categoria) AS Desconto
FROM Produtos;
```

**Solução (DEPOIS):** Reescrever como Inline Table-Valued Function (iTVF).

```sql
-- iTVF: retorna uma tabela de uma linha com o valor calculado
CREATE FUNCTION dbo.CalculaDesconto_iTVF (@Preco DECIMAL(10,2), @Categoria INT)
RETURNS TABLE
AS
RETURN
(
    SELECT
        CASE
            WHEN @Categoria = 1 THEN @Preco * 0.1
            WHEN @Categoria = 2 THEN @Preco * 0.2
            ELSE @Preco * 0.05
        END AS Desconto
);
GO

-- Uso com CROSS APPLY (o otimizador expande a função no plano)
SELECT p.IdProduto, p.Preco, calc.Desconto
FROM Produtos p
CROSS APPLY dbo.CalculaDesconto_iTVF(p.Preco, p.Categoria) calc;
```

**Motivo:** Scalar UDFs não inlineáveis rodam em um contexto de execução separado, uma vez por linha, com overhead de chamada e troca de contexto. Em tabelas grandes, isso pode ser devastador para performance. As iTVFs são expandidas pelo otimizador diretamente no plano da consulta, como se a lógica estivesse escrita inline, permitindo otimizações como *Index Seek*, *Predicate Pushdown*, etc.

## Recomendação

- **Sempre** que usar funções escalares, use `get_object_metadata` para verificar a coluna `is_inlineable` em `sys.sql_modules`.
- Se `is_inlineable = 0`, reescreva a função como iTVF (mesmo que o retorno seja uma única linha e coluna) e acesse via `CROSS APPLY` ou `OUTER APPLY`.
- **Restrições comuns que quebram o inlining:**
  - Uso de variáveis locais dentro da função.
  - Chamadas a outras Scalar UDFs não inlineáveis.
  - Uso de cursores ou tabelas temporárias.
  - Funções de sistema não inlineáveis (ex: `GETDATE()`, `RAND()`, `NEWID()` em alguns contextos).
  - Lógica com `TRY...CATCH`.
  - Acesso a tabelas sem `SCHEMABINDING`.
- Se não for possível reescrever para iTVF (ex: lógica muito complexa), considere transformar a função em uma **Stored Procedure** ou mover a lógica para a aplicação, mas essa é uma exceção.
- Monitore o plano de execução: se a função ainda aparecer como `Table-valued Function` com operador `Compute Scalar` em vez de estar integrada ao plano, o inlining não está funcionando.

---
**⚠️ Importante:** O recurso de Scalar UDF Inlining foi introduzido no SQL Server 2019 (nível de compatibilidade 150). Para versões anteriores, a única solução é usar iTVFs desde o início. Mesmo em versões mais novas, a iTVF é a abordagem mais segura e garantida para evitar RBAR.