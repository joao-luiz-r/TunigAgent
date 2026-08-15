---
name: use_output_clause_for_atomic_operations
description: Detecta operações de INSERT, UPDATE ou DELETE seguidas por consultas separadas para obter dados modificados (ex: SELECT SCOPE_IDENTITY()) ou para logging, e recomenda o uso da cláusula OUTPUT para capturar os dados de forma atômica, eficiente e em uma única instrução, eliminando gaps de concorrência e reduzindo idas ao disco. Inclui ressalvas sobre restrições de uso (triggers, FK, views particionadas) e a alternativa com tabela temporária.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - output clause
  - scope_identity
  - dados apos dml
  - clausula output
  - capturar dados modificados
  - output inserted
---

# Skill: use_output_clause_for_atomic_operations

## Quando usar

Use quando uma operação de modificação de dados (`INSERT`, `UPDATE` ou `DELETE`) precisar:

- **Retornar dados gerados** (ex: valor de `IDENTITY`, colunas calculadas, `NEWID()`, etc.) que serão usados na aplicação.
- **Registrar em uma tabela de log** (auditoria) as alterações realizadas, incluindo valores antigos e novos.
- **Realizar ambas as ações em uma única transação**, garantindo consistência e atomicidade.

O padrão comum (e problemático) é fazer a modificação e, em seguida, executar uma consulta separada para obter os dados, como:

- `INSERT INTO ... ; SELECT SCOPE_IDENTITY();` (não atômico, sujeito a concorrência, duas viagens ao banco)
- `DELETE FROM ... WHERE ...;` seguido de `SELECT * FROM ... WHERE ...` para log (inconsistente se outros dados forem alterados entre as instruções)

A cláusula `OUTPUT` resolve esses problemas:

- **Atomicidade:** os dados são capturados exatamente no momento da modificação.
- **Eficiência:** uma única instrução faz tudo, reduzindo viagens ao banco e latência.
- **Precisão:** você tem acesso aos valores antes (`DELETED.*`) e depois (`INSERTED.*`) da modificação.

## Instruções

Sua missão é identificar operações de DML que poderiam usar `OUTPUT` e reescrevê-las para capturar os dados modificados de forma atômica e eficiente.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Analise a operação atual:
   - Verifique se há um `INSERT`, `UPDATE` ou `DELETE` seguido por um `SELECT` (ex: `SCOPE_IDENTITY()`, `@@ROWCOUNT`, ou uma consulta para log).
   - Identifique se a aplicação precisa dos valores gerados (IDs, colunas computadas) ou se há necessidade de auditoria.
4. Reescreva a operação:
   - Adicione a cláusula `OUTPUT` antes do `INTO` (para armazenar em uma tabela) ou após a cláusula `SET`/`WHERE` para retornar diretamente.
   - Use `INSERTED.*` para valores novos e `DELETED.*` para valores antigos (no caso de `UPDATE` e `DELETE`).
   - Se quiser retornar para a aplicação, use `OUTPUT ...` (sem `INTO`), que devolve os dados como um conjunto de resultados.
   - Se quiser logar, use `OUTPUT ... INTO tabela_log`.
5. **Restrições importantes (do PDF):**
   - Você **não** pode usar `OUTPUT INTO` se a tabela de destino (onde os dados serão despejados) tiver:
     - **Triggers ativos** (INSTEAD OF ou AFTER).
     - **Restrições de chave estrangeira (FOREIGN KEY)** apontando para ela (ou para a tabela origem).
     - **Views particionadas** ou tabelas com particionamento.
   - Para contornar essas restrições, use uma **tabela temporária** como destino intermediário:
     - `OUTPUT ... INTO #temp`
     - Em seguida, `INSERT INTO tabela_final SELECT * FROM #temp`
6. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita para usar `OUTPUT`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes, mencione isso.
   - Se a consulta puder se beneficiar de novos índices para melhorar a performance, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Operação DML seguida por consulta separada, não atômica e ineficiente.

```sql
-- Exemplo 1: Inserir cliente e recuperar o ID gerado
INSERT INTO Clientes (Nome, Email)
VALUES ('João Silva', 'joao@email.com');

SELECT SCOPE_IDENTITY() AS NovoID;

-- Exemplo 2: Atualizar cliente e registrar a alteração (log)
UPDATE Clientes SET Ativo = 0 WHERE ClienteID = 1;

INSERT INTO HistoricoAlteracoes (ClienteID, StatusAntigo, StatusNovo, DataAlteracao)
SELECT ClienteID, Ativo, 0, GETDATE()
FROM Clientes
WHERE ClienteID = 1;
```

**Solução (DEPOIS):** Usar `OUTPUT` em uma única instrução, atômica e eficiente.

```sql
-- Exemplo 1: Inserir e retornar o ID diretamente
INSERT INTO Clientes (Nome, Email)
OUTPUT INSERTED.ClienteID
VALUES ('João Silva', 'joao@email.com');

-- Exemplo 2: Atualizar e logar com OUTPUT INTO (desde que a tabela de log não tenha triggers/FK)
UPDATE Clientes
SET Ativo = 0
OUTPUT INSERTED.ClienteID, DELETED.Ativo, INSERTED.Ativo, GETDATE()
INTO HistoricoAlteracoes (ClienteID, StatusAntigo, StatusNovo, DataAlteracao)
WHERE ClienteID = 1;

-- Alternativa com tabela temporária (para contornar restrições)
CREATE TABLE #temp (ClienteID INT, StatusAntigo BIT, StatusNovo BIT, DataAlteracao DATETIME);

UPDATE Clientes
SET Ativo = 0
OUTPUT INSERTED.ClienteID, DELETED.Ativo, INSERTED.Ativo, GETDATE()
INTO #temp
WHERE ClienteID = 1;

INSERT INTO HistoricoAlteracoes (ClienteID, StatusAntigo, StatusNovo, DataAlteracao)
SELECT * FROM #temp;

DROP TABLE #temp;
```

**Motivo:** A abordagem tradicional separa as operações, criando uma janela de tempo onde outros processos podem alterar os dados (problema de concorrência) e exigindo duas viagens ao banco (aumento de latência). O `OUTPUT` captura os dados no momento exato da modificação, de forma atômica e eficiente, retornando diretamente para a aplicação ou para uma tabela de log. Isso elimina inconsistências, reduz o tráfego de rede e melhora a performance.

## Recomendação

- **Use `OUTPUT` sempre que:**
  - Precisar do valor de um `IDENTITY`, `NEWID()`, ou coluna calculada após uma inserção.
  - Precisar auditar alterações (log com valores antigos e novos).
  - Precisar retornar dados modificados para a aplicação (ex: atualizar cache).
- **Escolha a variante correta:**
  - `OUTPUT ... INTO tabela_log` → para persistência em uma tabela de log (desde que permitido).
  - `OUTPUT ...` (sem `INTO`) → para retornar dados diretamente para a aplicação como um conjunto de resultados.
- **Contornando restrições:**
  - Se a tabela de destino tiver triggers, FK ou for particionada, use uma **tabela temporária** como estágio intermediário e depois faça o `INSERT` final.
- **Plano de execução:** Verifique se a operação com `OUTPUT` está usando índices adequados (ex: buscas por `ClienteID`). Se não, emita o handoff para `create_assertive_index`.

---
**⚠️ Importante:** O `OUTPUT` não pode ser usado em consultas que envolvam tabelas com triggers que usam `INSERTED`/`DELETED` de forma complexa. Nesses casos, a tabela temporária é a solução. Sempre teste com sua carga real para garantir que a atomicidade e a performance sejam alcançadas.