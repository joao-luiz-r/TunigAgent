---
name: ensure_fk_indexes
description: Detecta colunas de chave estrangeira sem índice de suporte, que geram table scans em joins e operações de exclusão.
tools:
  - get_table_schema
  - get_table_indexes
---

# Skill: ensure_fk_indexes

## Quando usar

Use quando um join ou uma operação de exclusão/atualização de registro pai for lenta e a coluna de FK não possuir índice de suporte.

## Instruções

Sua missão é verificar se as colunas de chave estrangeira possuem índices de suporte. Analise o schema das tabelas (colunas, tipos) com `get_table_schema` e os índices existentes com `get_table_indexes`. Quando uma coluna que participa de uma FK não possui índice cobrindo-a, recomende explicitamente a criação de um índice na coluna da FK. Conclua sempre com uma recomendação objetiva e, quando possível, com o script `CREATE INDEX` correspondente.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Coluna de chave estrangeira sem índice de suporte, forçando table scans em joins, deletes e updates que referenciam a FK.

**Solução (DEPOIS):** Criar um índice não-clusterizado sobre a coluna da FK para acelerar as operações relacionais.

**Script ANTES:**

```sql
SELECT p.* FROM Pedidos p JOIN Clientes c ON c.ClienteId = p.ClienteId WHERE c.Uf = 'SP';
```

**Script DEPOIS:**

```sql
CREATE INDEX IX_Pedidos_ClienteId ON Pedidos (ClienteId);
```

**Motivo:** Sem índice na FK, o SQL Server executa table scan para casar as linhas do join; o índice transforma em Index Seek.

## Recomendação

Criar um índice na tabela {tabela} sobre a coluna {coluna} (referente à FK {fk}) para evitar varreduras de tabela em joins e operações relacionadas.
