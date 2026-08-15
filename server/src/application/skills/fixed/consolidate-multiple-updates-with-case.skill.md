---
name: consolidate_multiple_updates_with_case
description: Detecta múltiplos comandos UPDATE na mesma tabela que atualizam a mesma coluna com valores diferentes baseados em condições distintas, e recomenda consolidá-los em um único UPDATE usando CASE, reduzindo acessos à tabela, bloqueios e tempo de execução.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - multiplos update
  - varios update na mesma tabela
  - consolidar update
  - update com case
  - mesclar updates
  - unificar updates
---

# Skill: consolidate_multiple_updates_with_case

## Quando usar

Use quando uma operação precisar atualizar uma coluna (ou colunas) de uma tabela com valores diferentes, dependendo de condições distintas, e a abordagem atual utilizar **múltiplos comandos UPDATE separados**.

Exemplo típico:

```sql
UPDATE Pedidos SET Prioridade = 1 WHERE Status = 'Novo';
UPDATE Pedidos SET Prioridade = 2 WHERE Status = 'Processando';
UPDATE Pedidos SET Prioridade = 3 WHERE Status = 'Pendente';
```

**Problema:** Cada comando UPDATE percorre a tabela (ou um índice) separadamente, resultando em:

- Múltiplas leituras e escritas na tabela (custo multiplicado).
- Maior tempo total de execução.
- Maior janela de bloqueio, aumentando o risco de contenção em ambientes concorrentes.
- Código repetitivo e menos legível.

**Solução:** Consolidar todos os UPDATEs em **um único comando** usando `CASE` para definir o valor da coluna com base nas condições, de forma que a tabela seja percorrida uma única vez.

**⚠️ NÃO confunda com `use_join_in_delete_update`:** esta skill consolida múltiplos `UPDATE`s **na mesma tabela** com valores distintos por condição (não há join; o valor vem de um `CASE`). A skill `use_join_in_delete_update` trata `DELETE`/`UPDATE` cujo conjunto de linhas é definido com base em **outra tabela** (via `JOIN`). Se o valor/condição vier de outra tabela, acione `[SKILL_HANDOFF:use_join_in_delete_update]`.

## Instruções

Sua missão é identificar múltiplos comandos UPDATE na mesma tabela, que atualizam a mesma coluna com condições diferentes, e reescrevê-los como um único UPDATE com `CASE`.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes da tabela envolvida com `get_table_indexes`.
3. Identifique os comandos UPDATE na mesma tabela:
   - Mesma tabela alvo.
   - Atualizam a mesma coluna (ou colunas com lógica semelhante).
   - Condições mutuamente exclusivas (ex: `Status = 'Novo'`, `Status = 'Processando'`).
   - Não há dependências entre os UPDATEs (ex: um UPDATE não depende do resultado do anterior).
4. Reescreva a consulta:
   - Combine todos os comandos em um único `UPDATE`.
   - Use `CASE` para definir o novo valor da coluna com base nas condições.
   - Inclua um `ELSE` para manter o valor original quando nenhuma condição for atendida (evita sobrescrever com `NULL`).
   - Adicione um `WHERE` que filtre todas as linhas que serão afetadas (ex: `WHERE Status IN ('Novo', 'Processando', 'Pendente')`) para limitar as linhas processadas.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da consolidação de UPDATEs. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a consolidação permitir o uso de índices existentes (ex: índice na coluna de filtro), mencione isso.
   - Se faltar índices para otimizar o filtro ou a condição, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Múltiplos comandos UPDATE, percorrendo a tabela várias vezes.

```sql
-- Três comandos UPDATE separados
UPDATE Pedidos SET Prioridade = 1 WHERE Status = 'Novo';
UPDATE Pedidos SET Prioridade = 2 WHERE Status = 'Processando';
UPDATE Pedidos SET Prioridade = 3 WHERE Status = 'Pendente';
```

**Solução (DEPOIS):** Um único UPDATE com `CASE`, percorrendo a tabela uma vez.

```sql
UPDATE Pedidos
SET Prioridade = 
    CASE
        WHEN Status = 'Novo'        THEN 1
        WHEN Status = 'Processando' THEN 2
        WHEN Status = 'Pendente'    THEN 3
        ELSE Prioridade -- Mantém o valor atual se nenhuma condição for atendida
    END
WHERE Status IN ('Novo', 'Processando', 'Pendente');
```

**Motivo:** Cada `UPDATE` separado força o SQL Server a ler e modificar a tabela (ou índice) uma vez por comando. Se houver 3 condições, a tabela será percorrida 3 vezes, multiplicando o custo de I/O, CPU e bloqueios. Consolidando com `CASE`, a tabela é percorrida **uma única vez**, e as condições são avaliadas linha a linha em uma única passagem, aplicando o valor correto. O resultado é:

- **Menos leituras e escritas:** custo reduzido (até 3x menos).
- **Menor tempo de execução:** mais rápido.
- **Menor janela de bloqueio:** menos chance de deadlock ou contenção.
- **Código mais limpo:** lógica centralizada e fácil de manter.

## Recomendação

- **Consolide UPDATEs sempre** que houver múltiplos comandos atualizando a mesma coluna com base em condições distintas.
- **Inclua `ELSE`:** sempre adicione `ELSE coluna` para evitar que linhas fora das condições sejam atualizadas com `NULL`.
- **Use `WHERE` para filtrar:** adicione um `WHERE` que inclua todas as linhas que serão afetadas (ex: `WHERE Status IN ('Novo', 'Processando', 'Pendente')`). Isso reduz o número de linhas avaliadas pelo `CASE` e melhora a performance.
- **Atualizações de múltiplas colunas:** você pode usar a mesma técnica para atualizar várias colunas em um único `UPDATE`:
  ```sql
  UPDATE Pedidos
  SET 
      Prioridade = CASE WHEN Status = 'Novo' THEN 1 WHEN ... END,
      Responsavel = CASE WHEN Status = 'Novo' THEN 'Setor A' WHEN ... END
  WHERE Status IN ('Novo', 'Processando', 'Pendente');
  ```
- **Verifique índices:** Se a tabela for grande, certifique-se de que a coluna usada no `WHERE` (ex: `Status`) tenha um índice. Isso permitirá um *Index Seek* em vez de um *Table Scan*. Se não houver índice, emita o handoff para `create_assertive_index`.
- **Teste com dados:** Valide que o resultado do `CASE` é equivalente à série de UPDATEs originais.

---
**⚠️ Importante:** Essa técnica é especialmente eficaz em ambientes de alta concorrência, onde múltiplos UPDATEs podem causar bloqueios prolongados. Consolidar as atualizações reduz a janela de bloqueio e melhora a escalabilidade do sistema.