---
name: use_join_in_delete_update
description: Detecta operações DELETE ou UPDATE que utilizam cursores, loops ou subconsultas para modificar registros com base em outra tabela, e recomenda o uso da sintaxe com JOIN (específica do SQL Server) para melhor performance, eliminando processamento linha a linha e aproveitando operações baseadas em conjunto.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - delete join
  - update join
  - update com join
  - delete com join
  - modificar com base em outra tabela
  - join em delete update
---

# Skill: use_join_in_delete_update

## Quando usar

Use quando uma operação `DELETE` ou `UPDATE` precisar modificar registros de uma tabela com base em informações de outra tabela (ou condição de junção), e a abordagem atual utilizar:

- Cursores (ex: `DECLARE CURSOR ... FETCH NEXT ...`)
- Loops (`WHILE`)
- Subconsultas correlacionadas no `WHERE` (ex: `WHERE id IN (SELECT ...)`)
- Múltiplas instruções separadas

Nesses cenários, o SQL Server oferece uma sintaxe específica que permite usar `JOIN` diretamente no `DELETE` ou `UPDATE`, tornando a operação mais eficiente, legível e rápida, pois trabalha com conjuntos inteiros em vez de linha a linha.

**⚠️ NÃO confunda com `consolidate_multiple_updates_with_case`:** esta skill é para `DELETE`/`UPDATE` cujas linhas/alvos vêm de **outra tabela** (via `JOIN`). A skill `consolidate_multiple_updates_with_case` trata **vários `UPDATE`s na mesma tabela** com valores distintos por condição (unificados com `CASE`, sem join). Se os updates forem da mesma tabela com valores por condição, acione `[SKILL_HANDOFF:consolidate_multiple_updates_with_case]`.

## Instruções

Sua missão é identificar operações de `DELETE` ou `UPDATE` que podem ser reescritas usando `JOIN` na sintaxe do SQL Server e reescrevê-las para melhorar a performance.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Analise a operação:
   - Localize `DELETE` ou `UPDATE` que referenciam outra tabela em subconsultas ou que usam cursores/loops.
   - Verifique se a lógica pode ser expressa como um `JOIN` entre a tabela alvo e a tabela de origem/filtro.
4. Reescreva a operação:
   - **Para DELETE:** A sintaxe é `DELETE alias FROM tabela_alvo alias INNER JOIN tabela_origem ON condicao WHERE ...` (ou `LEFT JOIN` conforme necessário).
   - **Para UPDATE:** A sintaxe é `UPDATE alias SET coluna = valor FROM tabela_alvo alias INNER JOIN tabela_origem ON condicao WHERE ...`.
   - Mantenha todas as condições de filtro no `WHERE` (que podem ser movidas para a junção ou mantidas separadamente).
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita da operação DML com `JOIN`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes, mencione isso.
   - Se faltar índices para as colunas de junção ou filtro, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

### Exemplo 1: DELETE com JOIN

**Problema (ANTES):** Exclusão usando subconsulta ou cursor, que pode ser ineficiente.

```sql
-- Usando subconsulta (pode ser ineficiente se a tabela for grande)
DELETE FROM corp_pessoas
WHERE id_pessoa IN (
    SELECT id_pessoa_pagadora
    FROM corp_endosso
    WHERE id_sub = 1
);
```

**Solução (DEPOIS):** Usar `DELETE` com `JOIN` (sintaxe do SQL Server).

```sql
-- DELETE com JOIN, mais eficiente e claro
DELETE cp
FROM corp_pessoas cp
INNER JOIN corp_endosso ce ON cp.id_pessoa = ce.id_pessoa_pagadora
WHERE ce.id_sub = 1;
```

**Motivo:** A subconsulta pode gerar um plano com *Nested Loops* e múltiplas leituras. O `JOIN` permite ao otimizador usar *Hash Match* ou *Merge Join*, especialmente se houver índices adequados. Além disso, a sintaxe com `JOIN` é mais direta e evita a subconsulta.

---

### Exemplo 2: UPDATE com JOIN

**Problema (ANTES):** Atualização usando cursor ou subconsulta, podendo ser lenta.

```sql
-- Usando cursor (exemplo conceitual)
DECLARE @id_pessoa INT, @novo_nome VARCHAR(100)
DECLARE cur CURSOR FOR
    SELECT cp.id_pessoa, 'teste'
    FROM corp_pessoas cp
    INNER JOIN corp_endosso ce ON cp.id_pessoa = ce.id_pessoa_pagadora
    WHERE ce.id_sub = 1
OPEN cur
FETCH NEXT FROM cur INTO @id_pessoa, @novo_nome
WHILE @@FETCH_STATUS = 0
BEGIN
    UPDATE corp_pessoas SET nm_pessoa = @novo_nome WHERE id_pessoa = @id_pessoa
    FETCH NEXT FROM cur INTO @id_pessoa, @novo_nome
END
CLOSE cur
DEALLOCATE cur;
```

**Solução (DEPOIS):** Usar `UPDATE` com `JOIN` (sintaxe do SQL Server).

```sql
-- UPDATE com JOIN, muito mais eficiente
UPDATE cp
SET cp.nm_pessoa = 'teste'
FROM corp_pessoas cp
INNER JOIN corp_endosso ce ON cp.id_pessoa = ce.id_pessoa_pagadora
WHERE ce.id_sub = 1;
```

**Motivo:** O cursor executa operações linha a linha, com múltiplas viagens ao banco. O `UPDATE` com `JOIN` opera em conjunto, atualizando todas as linhas de uma só vez, com muito menos sobrecarga de I/O e CPU. Além disso, a sintaxe é mais compacta e fácil de manter.

## Recomendação

- **Sempre** que precisar modificar dados com base em outra tabela, prefira a sintaxe com `JOIN` em vez de cursores, loops ou subconsultas complexas.
- **Cuidado com a sintaxe:** No SQL Server, a ordem é `DELETE alias FROM` ou `UPDATE alias SET ... FROM`. Não confunda com a sintaxe do Oracle ou MySQL.
- Verifique se há índices nas colunas de junção (no exemplo, `corp_pessoas.id_pessoa` e `corp_endosso.id_pessoa_pagadora`). Se faltar, emita o handoff para `create_assertive_index`.
- Em operações de grande volume, considere transações e tamanho de lote para evitar bloqueios excessivos, mas a reescrita com `JOIN` já é o primeiro passo para performance.
- Para `DELETE`, você pode usar `LEFT JOIN` se quiser excluir registros que não tenham correspondência (embora isso geralmente não faça sentido, pois excluiria todos). Use com cautela.

---
**⚠️ Importante:** Essa técnica é específica do SQL Server (e alguns outros SGBDs). Em outros bancos, a sintaxe pode ser diferente (ex: usar `USING` no PostgreSQL). Sempre confirme a compatibilidade.