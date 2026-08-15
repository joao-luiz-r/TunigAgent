---
name: avoid_unnecessary_foreign_key_updates
description: Detecta UPDATEs que incluem colunas de chave estrangeira (FOREIGN KEY) mesmo quando seus valores não são alterados, forçando o SQL Server a realizar verificações de integridade referencial desnecessárias. Recomenda atualizar apenas as colunas que realmente mudaram, eliminando custos ocultos de I/O e CPU.
tools:
  - get_query_text
  - get_table_indexes
  - get_table_schema
  - get_foreign_keys
keywords:
  - update de fk
  - update de chave estrangeira
  - atualizar coluna de chave estrangeira
  - update sem mudar a fk
  - update com fk
  - verificacao de integridade referencial
---

# Skill: avoid_unnecessary_foreign_key_updates

## Quando usar

Use quando uma instrução `UPDATE` incluir colunas que são **chaves estrangeiras (FOREIGN KEY)**, mas cujos valores **não estão sendo alterados** (permanecem os mesmos). Isso ocorre com frequência quando:

- Um ORM gera `UPDATE` com todas as colunas da entidade, mesmo as não modificadas.
- Um procedimento armazenado recebe todos os valores e faz um `UPDATE` com todas as colunas.
- O desenvolvedor inclui colunas "por precaução" em um `UPDATE` genérico.

**O problema:** Quando uma coluna com `FOREIGN KEY` está presente na cláusula `SET` de um `UPDATE`, o SQL Server **não verifica se o valor realmente mudou** antes de validar a integridade referencial. Ele simplesmente executa uma busca na tabela referenciada para confirmar que o valor existe, mesmo que o valor seja exatamente o mesmo já armazenado.

Isso gera:

- **I/O desnecessário:** buscas extras na tabela referenciada para cada linha atualizada.
- **CPU desperdiçada:** verificações de integridade que não alteram o resultado.
- **Bloqueios adicionais:** maior tempo de execução e janela de bloqueio.
- **Custo multiplicado:** em operações em lote (milhares ou milhões de linhas), o impacto pode ser catastrófico.

**A solução:** Atualizar **apenas as colunas que realmente mudaram** ou usar lógica condicional para verificar se o valor da chave estrangeira foi alterado antes de incluí-lo no `UPDATE`.

## Instruções

Sua missão é identificar `UPDATE`s que incluem colunas de chave estrangeira sem necessidade (valores não mudaram) e recomendar a reescrita para atualizar apenas as colunas que realmente sofreram alteração.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Identifique a tabela alvo e suas colunas de chave estrangeira com `get_foreign_keys` (colunas que participam de FKs na tabela), confirmando com o schema de colunas de `get_table_schema`.
4. Analise o `UPDATE`:
   - Verifique se colunas com `FOREIGN KEY` estão sendo atualizadas.
   - Avalie se os valores dessas colunas podem permanecer os mesmos (ex: em um ORM que envia todas as colunas, ou em um procedimento que recebe todos os valores).
5. Reescreva a consulta:
   - **Opção 1 (recomendada):** Atualize **apenas as colunas que realmente mudaram**. Se a coluna de chave estrangeira não mudou, remova-a do `SET`.
   - **Opção 2:** Use uma cláusula `WHERE` que compare o valor antigo com o novo, e execute o `UPDATE` apenas se houver diferença:
     ```sql
     UPDATE Tabela
     SET FK_Coluna = @NovoValor
     WHERE Id = @Id AND FK_Coluna <> @NovoValor;
     ```
     Isso garante que o `UPDATE` só ocorra quando o valor realmente mudar.
   - **Opção 3:** Em cenários com muitas colunas, use um `CASE` para atualizar apenas quando houver mudança, mas isso pode não evitar a verificação da FK (o SQL Server ainda vê a coluna no `SET`). A opção 2 é mais segura.
6. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da otimização de `UPDATE`s com chaves estrangeiras. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes (ex: índice na coluna FK), mencione isso.
   - Se faltar índices para otimizar a verificação ou a condição, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** UPDATE incluindo coluna FK sem necessidade, causando verificação desnecessária.

```sql
-- Suponha que Posts.OwnerUserId é uma FOREIGN KEY para Users.Id
-- O valor 42 já existe na linha, mas está no SET
UPDATE dbo.Posts
SET
    Body = 'Conteúdo do post atualizado...',
    OwnerUserId = 42  -- Valor não mudou, mas força verificação da FK!
WHERE
    Id = 123;
```

**Solução (DEPOIS) – Opção 1: Atualizar apenas colunas que mudaram.**

```sql
-- Remove a coluna FK do SET, já que ela não mudou
UPDATE dbo.Posts
SET
    Body = 'Conteúdo do post atualizado...'
WHERE
    Id = 123;
```

**Solução (DEPOIS) – Opção 2: Atualizar condicionalmente apenas se o valor mudar.**

```sql
-- Executa o UPDATE apenas se o valor da FK realmente mudar
UPDATE dbo.Posts
SET
    Body = 'Conteúdo do post atualizado...',
    OwnerUserId = 42
WHERE
    Id = 123
    AND OwnerUserId <> 42;  -- Só executa se o valor for diferente
```

**Motivo:** Quando uma coluna com `FOREIGN KEY` está na cláusula `SET`, o SQL Server não verifica se o valor é o mesmo – ele simplesmente executa a verificação de integridade referencial. Isso significa uma busca na tabela referenciada (ex: `Users`) para cada linha atualizada, mesmo que o valor não tenha mudado. Em operações em lote, isso pode multiplicar o custo de I/O e CPU, além de aumentar a contenção e bloqueios. Ao remover a coluna FK do `SET` ou adicionar uma condição `WHERE` que garanta que o valor realmente mudou, você elimina a verificação desnecessária e melhora a performance.

## Recomendação

- **Seja explícito:** atualize apenas as colunas que realmente mudaram. Isso é a prática mais eficiente e segura.
- **Use `WHERE` com comparação:** se você precisar incluir a FK no `UPDATE` (porque ela pode mudar), adicione uma condição `WHERE FK_Coluna <> @NovoValor` para garantir que a verificação só ocorra quando necessário.
- **Cuidado com ORMs:** Frameworks modernos como Entity Framework Core, por padrão, rastreiam mudanças e geram `UPDATE` apenas com colunas modificadas. Evite forçar a atualização de todas as colunas (ex: usando `Update` em vez de rastrear a entidade carregada).
- **Procedimentos armazenados:** Se você recebe todos os valores em um procedimento, compare com os valores atuais antes de executar o `UPDATE`.
- **Monitore planos:** Use `SET STATISTICS IO ON` para comparar o custo de I/O antes e depois da otimização.
- **Índices:** Certifique-se de que a coluna FK tenha um índice para que a verificação de integridade (quando necessária) seja rápida. Se não houver índice, emita o handoff para `create_assertive_index`.

---
**⚠️ Importante:** O custo oculto de `UPDATE`s com chaves estrangeiras é uma das armadilhas mais negligenciadas em ambientes com ORMs ou procedimentos genéricos. Em tabelas grandes e com milhões de linhas, esse padrão pode causar degradação severa de performance sem que o desenvolvedor perceba. Sempre atualize apenas o necessário.