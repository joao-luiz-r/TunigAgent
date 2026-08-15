---
name: handle_parameter_sniffing
description: Detecta consultas ou Stored Procedures que sofrem com Parameter Sniffing, onde o plano de execução é otimizado para um valor específico de parâmetro na primeira execução e causa lentidão para outros valores. Recomenda estratégias de mitigação como OPTION (RECOMPILE), OPTIMIZE FOR UNKNOWN, OPTIMIZE FOR, SQL dinâmico com sp_executesql e ajuste de estatísticas.
tools:
  - get_query_text
  - get_table_indexes
  - get_execution_plan
keywords:
  - parameter sniffing
  - optimize for unknown
  - sniffing de parametros
  - plano para um parametro
  - recompile
  - otimizar para um parametro
---

# Skill: handle_parameter_sniffing

## Quando usar

Use quando uma consulta ou Stored Procedure apresentar **lentidão intermitente** ou **degradação repentina de desempenho** dependendo dos valores dos parâmetros fornecidos. Isso ocorre quando o SQL Server "fareja" o valor do parâmetro na primeira execução e gera um plano de execução otimizado para aquele valor específico, mas esse plano se torna ineficiente para outros valores.

**Sintomas típicos:**

- A mesma consulta executa rápido para alguns valores e muito lento para outros.
- Lentidão intermitente que aparece e desaparece sem alterações no código.
- Plano de execução mostra estimativas de cardinalidade muito diferentes das linhas reais.
- Operadores de *Sort* ou *Hash Match* mostram spills (exclamação amarela) indicando falta de memória.
- O XML do plano mostra `ParameterCompiledValue` com um valor específico que não representa a maioria dos dados.

**Causa raiz:** O otimizador de consultas compila um plano baseado no valor do parâmetro na primeira execução (ou na última recompilação). Se esse valor for atípico (ex: retorna poucas linhas), o plano pode ser ineficiente para valores que retornam muitas linhas (ou vice-versa), causando:

- **Alocação de memória incorreta:** Muita memória (overallocation) ou pouca memória (underallocation), forçando spills para tempdb.
- **Escolha de operadores inadequados:** Nested Loops em vez de Hash Match, ou vice-versa.
- **Uso de índices ineficientes:** Index Seek quando deveria ser Scan, ou Scan quando deveria ser Seek.

## Instruções

Sua missão é identificar consultas afetadas por Parameter Sniffing e recomendar a estratégia de mitigação mais adequada para cada cenário.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Analise a consulta:
   - Verifique se há parâmetros na consulta ou Stored Procedure.
   - Identifique se a consulta apresenta comportamento intermitente.
   - Verifique o plano de execução para ver se há *spills* (sort/hash) ou estimativas incorretas.
4. Selecione a estratégia de mitigação mais adequada:
   - **Opção 1: OPTION (RECOMPILE)** – Para consultas com pouca frequência de execução, onde o custo da recompilação é aceitável. Força a recompilação a cada execução, adaptando o plano ao valor real do parâmetro.
   - **Opção 2: OPTION (OPTIMIZE FOR UNKNOWN)** – Para consultas com alta frequência, onde o custo de recompilação não é aceitável. Gera um plano genérico baseado em estatísticas, sem favorecer um valor específico.
   - **Opção 3: OPTION (OPTIMIZE FOR (@param = valor))** – Para consultas onde você sabe que um valor específico produz o melhor plano para a maioria das execuções.
   - **Opção 4: SQL Dinâmico com sp_executesql** – Para consultas com muitos parâmetros opcionais, onde você pode montar a cláusula WHERE condicionalmente.
   - **Opção 5: Atualizar Estatísticas** – Como solução temporária, forçando a recompilação do plano, mas não resolve definitivamente.
   - **Opção 6: WITH RECOMPILE na Stored Procedure** – Como alternativa mais agressiva ao OPTION (RECOMPILE), mas apenas quando a SP inteira precisa ser recompilada.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da recomendação de estratégias de mitigação. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a otimização envolver criação de índices para melhorar a performance geral, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Stored Procedure com Parameter Sniffing causando lentidão intermitente.

```sql
-- Stored Procedure que sofre com Parameter Sniffing
CREATE PROCEDURE BuscarPedidos
    @Status INT
AS
BEGIN
    SELECT PedidoID, ClienteID, DataPedido, ValorTotal
    FROM Pedidos
    WHERE Status = @Status;
END;
```

**Solução (DEPOIS) – Opção 1: OPTION (RECOMPILE) para consultas pouco frequentes.**

```sql
-- Recomendado quando a consulta é executada poucas vezes
-- e o custo da recompilação é aceitável.
CREATE PROCEDURE BuscarPedidos
    @Status INT
AS
BEGIN
    SELECT PedidoID, ClienteID, DataPedido, ValorTotal
    FROM Pedidos
    WHERE Status = @Status
    OPTION (RECOMPILE);  -- Recompila a cada execução
END;
```

**Solução (DEPOIS) – Opção 2: OPTIMIZE FOR UNKNOWN para consultas frequentes.**

```sql
-- Recomendado quando a consulta é executada com alta frequência
-- e o custo da recompilação não é aceitável.
CREATE PROCEDURE BuscarPedidos
    @Status INT
AS
BEGIN
    SELECT PedidoID, ClienteID, DataPedido, ValorTotal
    FROM Pedidos
    WHERE Status = @Status
    OPTION (OPTIMIZE FOR UNKNOWN);  -- Plano genérico baseado em estatísticas
END;
```

**Solução (DEPOIS) – Opção 3: OPTIMIZE FOR com valor específico.**

```sql
-- Recomendado quando você sabe que um valor específico
-- produz o melhor plano para a maioria das execuções.
CREATE PROCEDURE BuscarPedidos
    @Status INT
AS
BEGIN
    SELECT PedidoID, ClienteID, DataPedido, ValorTotal
    FROM Pedidos
    WHERE Status = @Status
    OPTION (OPTIMIZE FOR (@Status = 1));  -- Força o plano para Status = 1
END;
```

**Solução (DEPOIS) – Opção 4: SQL Dinâmico com sp_executesql (para parâmetros opcionais).**

```sql
-- Recomendado quando há muitos parâmetros opcionais
-- e você quer evitar o sniffing em cada combinação.
CREATE PROCEDURE BuscarPedidos
    @Status INT = NULL,
    @ClienteID INT = NULL,
    @DataInicio DATE = NULL,
    @DataFim DATE = NULL
AS
BEGIN
    DECLARE @sql NVARCHAR(MAX) = N'SELECT PedidoID, ClienteID, DataPedido, ValorTotal
                                   FROM Pedidos WHERE 1=1';
    
    IF @Status IS NOT NULL
        SET @sql += N' AND Status = @Status';
    
    IF @ClienteID IS NOT NULL
        SET @sql += N' AND ClienteID = @ClienteID';
    
    IF @DataInicio IS NOT NULL AND @DataFim IS NOT NULL
        SET @sql += N' AND DataPedido BETWEEN @DataInicio AND @DataFim';
    
    SET @sql += N' OPTION (OPTIMIZE FOR UNKNOWN)';
    
    EXEC sp_executesql @sql,
        N'@Status INT, @ClienteID INT, @DataInicio DATE, @DataFim DATE',
        @Status, @ClienteID, @DataInicio, @DataFim;
END;
```

**Motivo:** O Parameter Sniffing ocorre porque o SQL Server compila o plano baseado no valor do parâmetro na primeira execução. Se esse valor é atípico, o plano gerado pode ser ineficiente para outros valores. Cada estratégia de mitigação aborda o problema de forma diferente:

- **OPTION (RECOMPILE):** Força recompilação a cada execução, garantindo que o plano seja otimizado para o valor real. Ideal para consultas pouco frequentes.
- **OPTIMIZE FOR UNKNOWN:** Gera um plano genérico baseado em estatísticas, sem favorecer nenhum valor específico. Ideal para consultas frequentes com boa distribuição de dados.
- **OPTIMIZE FOR (@param = valor):** Força o plano para um valor específico que é conhecido por ser eficiente na maioria dos casos.
- **SQL Dinâmico:** Permite construir a consulta condicionalmente, evitando que parâmetros opcionais causem sniffing. O `OPTIMIZE FOR UNKNOWN` ajuda a manter planos estáveis.
- **Atualizar Estatísticas:** Pode forçar a recompilação do plano, mas não resolve definitivamente o problema (o novo plano pode novamente ser vítima de sniffing na próxima execução).

## Recomendação

- **Identifique o padrão:** Verifique no plano de execução se `ParameterCompiledValue` não representa a maioria dos valores utilizados.
- **Para consultas pouco frequentes:** Use `OPTION (RECOMPILE)` – é a solução mais simples e eficaz.
- **Para consultas frequentes:** Use `OPTIMIZE FOR UNKNOWN` ou `OPTIMIZE FOR` – evita o custo de recompilação.
- **Para parâmetros opcionais:** Use SQL dinâmico com `sp_executesql` e `OPTIMIZE FOR UNKNOWN`.
- **Evite WITH RECOMPILE na SP inteira:** Prefira `OPTION (RECOMPILE)` em queries específicas dentro da SP, para manter algum plano em cache.
- **Atualize estatísticas:** Mantenha estatísticas atualizadas (job semanal ou diário conforme a volatilidade dos dados), mas não confie nisso como solução definitiva.
- **Monitore planos:** Use DMVs como `sys.dm_exec_query_stats` para identificar consultas com recompilações frequentes ou planos ineficientes.
- **Índices:** Se a consulta ainda for lenta após mitigar o sniffing, verifique se há índices adequados. Se não, emita o handoff para `create_assertive_index`.

---
**⚠️ Importante:** O Parameter Sniffing é um dos problemas mais comuns e frustrantes em ambientes de produção. A escolha da estratégia de mitigação depende do padrão de execução da consulta (frequência, distribuição de dados, parâmetros opcionais). Teste cada abordagem com dados reais e monitore o desempenho para garantir a melhoria.