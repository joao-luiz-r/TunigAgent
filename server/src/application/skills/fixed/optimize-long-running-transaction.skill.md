---
name: optimize_long_running_transaction
description: Detecta Stored Procedures ou scripts com transações longas e atomizadas que causam bloqueios e lentidão, e recomenda uma abordagem incremental de otimização (índices, estatísticas, micro-otimizações e, por último, refatoração arquitetural) para reduzir a duração da transação sem comprometer a integridade dos dados.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - transacao longa
  - transacoes demoradas
  - bloqueios de longa duracao
  - transacao muito longa
  - blocking por transacao
  - transacao atomica longa
---

# Skill: optimize_long_running_transaction

## Quando usar

Use quando uma Stored Procedure ou script crítico executar uma **transação longa e atomizada** que cause bloqueios, contenção e lentidão no sistema, e onde **não é possível quebrar a transação** por questões de integridade de negócio.

**Sintomas típicos:**

- Stored Procedure com `BEGIN TRAN ... COMMIT` envolvendo múltiplas operações (`INSERT`, `UPDATE`, `DELETE`).
- Transações que duram segundos ou minutos, causando bloqueios em tabelas grandes.
- Queries dentro da transação que realizam *Table Scans* ou *Index Scans* ineficientes.
- Índices desnecessários ou ausentes que tornam as operações de escrita mais lentas.
- Estatísticas desatualizadas ou ausentes em colunas críticas.

**Desafio:** A transação é **atomizada por exigência de negócio** – não pode ser dividida em partes menores. A solução não é quebrar a transação, mas sim **reduzir sua duração** através de otimizações que não alterem a lógica de negócio.

## Instruções

Sua missão é identificar transações longas e recomendar um plano de otimização incremental, começando pelas soluções de menor impacto e menor risco, e avançando para soluções mais complexas apenas se necessário.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Analise a transação:
   - Identifique o escopo da transação (`BEGIN TRAN ... COMMIT/ROLLBACK`).
   - Liste todas as operações `INSERT`, `UPDATE`, `DELETE` e consultas dentro da transação.
   - Identifique quais tabelas são afetadas e quais índices existem nelas.
4. Aplique a abordagem incremental (da mais segura para a mais disruptiva):
   - **Nível 1 (Baixo risco, alto ganho):** Otimização e limpeza de índices existentes.
   - **Nível 2 (Baixo risco):** Criação de estatísticas específicas além das de índices.
   - **Nível 3 (Médio risco):** Micro-otimizações de queries (SARGability, evitar SELECT *, etc.).
   - **Nível 4 (Alto risco, disruptivo):** Revisão e refatoração da lógica de negócio (consistência eventual) – apenas se os níveis anteriores não forem suficientes.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da análise e recomendação de otimizações. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Para recomendações de índices (Nível 1), indique quais colunas seriam beneficiadas e acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - Para recomendações de estatísticas (Nível 2), indique quais colunas precisam de estatísticas manuais.
   - Para micro-otimizações (Nível 3), mostre exemplos de reescrita específicos.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Transação longa e atomizada, com múltiplas operações ineficientes.

```sql
-- Exemplo: Stored Procedure que processa um lote de pedidos em uma única transação
CREATE PROCEDURE ProcessarLotePedidos
    @LoteID INT
AS
BEGIN
    BEGIN TRAN;
    
    -- Atualiza status dos pedidos
    UPDATE Pedidos
    SET Status = 'Processando'
    WHERE LoteID = @LoteID;
    
    -- Insere registros de log
    INSERT INTO LogProcessamento (PedidoID, Data, Mensagem)
    SELECT PedidoID, GETDATE(), 'Início do processamento'
    FROM Pedidos
    WHERE LoteID = @LoteID;
    
    -- Atualiza estoque (várias operações)
    UPDATE Estoque
    SET Quantidade = Quantidade - p.Quantidade
    FROM Estoque e
    INNER JOIN Pedidos p ON e.ProdutoID = p.ProdutoID
    WHERE p.LoteID = @LoteID;
    
    -- Atualiza clientes
    UPDATE Clientes
    SET UltimaCompra = GETDATE()
    WHERE ClienteID IN (SELECT ClienteID FROM Pedidos WHERE LoteID = @LoteID);
    
    COMMIT TRAN;
END;
```

**Solução (DEPOIS):** Aplicar otimizações incrementais.

**Nível 1 – Otimização de Índices:**

```sql
-- Recomendação: Criar índices para acelerar as operações da transação.
-- Exemplo: Índice em Pedidos.LoteID para acelerar todas as buscas.
-- CREATE NONCLUSTERED INDEX IX_Pedidos_LoteID ON Pedidos(LoteID);
-- Exemplo: Índice em Pedidos.ProdutoID para acelerar o UPDATE do estoque.
-- CREATE NONCLUSTERED INDEX IX_Pedidos_ProdutoID ON Pedidos(ProdutoID);
-- Emitir handoff para create_assertive_index com essas recomendações.
```

**Nível 2 – Estatísticas Específicas:**

```sql
-- Recomendação: Criar estatísticas em colunas usadas em JOINs e WHERE.
-- Exemplo: CREATE STATISTICS Stat_Pedidos_LoteID ON Pedidos(LoteID);
-- Exemplo: CREATE STATISTICS Stat_Pedidos_ProdutoID ON Pedidos(ProdutoID);
-- Isso ajuda o otimizador a estimar melhor a cardinalidade.
```

**Nível 3 – Micro-Otimações (SARGability):**

```sql
-- Se o código tiver função na coluna (ex: WHERE YEAR(Data) = 2023)
-- Reescrever para: WHERE Data BETWEEN '2023-01-01' AND '2023-12-31'
-- Evitar SELECT * - selecionar apenas colunas necessárias.
-- Usar EXISTS em vez de IN com subconsultas, quando aplicável.
```

**Nível 4 – Refatoração Arquitetural (se necessário):**

```sql
-- Se os níveis 1-3 não forem suficientes, considerar:
-- Dividir o lote em lotes menores (ex: processar 1000 pedidos por vez).
-- Ou desacoplar partes da lógica para processamento assíncrono (filas).
-- Isso é uma mudança arquitetural significativa e deve ser avaliada com cuidado.
```

**Motivo:** Transações longas mantêm bloqueios por mais tempo, causando contenção e lentidão. A abordagem incremental foca em reduzir a duração da transação sem alterar sua atomicidade. Cada nível de otimização reduz o tempo de execução:

- **Nível 1 (Índices):** Transforma *Scans* em *Seeks*, reduzindo I/O. Remove índices desnecessários, reduzindo sobrecarga de escrita.
- **Nível 2 (Estatísticas):** Melhora as estimativas do otimizador, levando a planos mais eficientes.
- **Nível 3 (Micro-otimizações):** Elimina ineficiências no código SQL, reduzindo CPU e I/O.
- **Nível 4 (Refatoração):** Reduz a atomicidade da transação, mas com alto impacto arquitetural.

## Recomendação

1. **Priorize Nível 1 (Índices e Estatísticas):** São mudanças de baixo risco e alto potencial de ganho, sem impactar a lógica funcional. Comece aqui.
2. **Analise índices existentes:** Use DMVs como `sys.dm_db_index_usage_stats` para identificar índices pouco usados ou redundantes. Remova os desnecessários.
3. **Crie índices específicos:** Foque nas colunas usadas em `WHERE`, `JOIN` e `ORDER BY` dentro da transação.
4. **Crie estatísticas manuais:** Para colunas usadas em consultas, mas que não são indexadas, crie estatísticas para ajudar o otimizador.
5. **Micro-otimize queries:** Aplique técnicas de SARGability (evitar funções em colunas), substitua `SELECT *` por colunas específicas, e use `EXISTS` em vez de `IN` quando possível.
6. **Avalie o RCSI (Read Committed Snapshot Isolation):** Se leituras ainda sofrerem bloqueios, considere habilitar RCSI para permitir leituras sem bloqueio (mas isso não resolve bloqueios entre escritores).
7. **Refatoração apenas como último recurso:** Se os níveis anteriores não forem suficientes, avalie a desagregação da lógica (consistência eventual, filas), mas isso exige re-arquitetura significativa.

---
**⚠️ Importante:** Em sistemas legados, mudanças na lógica de negócio podem ter impactos imprevisíveis. A abordagem incremental minimiza riscos ao começar com as otimizações mais seguras (índices e estatísticas) antes de considerar mudanças mais profundas. Sempre teste em ambiente análogo à produção antes de aplicar em produção.