---
name: replace_or_between_columns_with_union_all
description: Detecta cláusulas WHERE com OR ligando colunas diferentes (ex: Email = @Busca OR Login = @Busca) que impedem o uso eficiente de índices, forçando Index Scan. Recomenda a reescrita com UNION ALL para permitir Index Seek em cada coluna separadamente, mantendo a lógica e evitando duplicatas.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - or entre colunas
  - or em colunas diferentes
  - index scan por or
  - union all para o or
  - or com colunas
  - reescrever or com union all
---

# Skill: replace_or_between_columns_with_union_all

## Quando usar

Use quando uma consulta contiver um operador `OR` na cláusula `WHERE` que combine **colunas diferentes**, como em:

- `WHERE Email = @Busca OR Login = @Busca`
- `WHERE Nome = @Busca OR Apelido = @Busca`
- `WHERE Telefone = @Busca OR Celular = @Busca`

Nesses casos, o otimizador do SQL Server **odeia o operador OR ligando colunas distintas**. Mesmo que cada coluna tenha um índice individual perfeito, o otimizador frequentemente desiste de usar os índices e faz um **Index Scan** completo em toda a tabela, porque o plano precisaria de um *Concatenation* ou *Merge* que nem sempre é eficiente com `OR`.

A solução é dividir a consulta em duas partes isoladas, cada uma filtrando uma coluna, e unir os resultados com `UNION ALL`. Isso permite que o otimizador use **Index Seek** em cada índice individual, concatenando os resultados de forma eficiente.

## Instruções

Sua missão é identificar o padrão de `OR` entre colunas diferentes e reescrever a consulta usando `UNION ALL`, garantindo que cada parte use seu próprio índice.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes` para confirmar se há índices adequados em cada coluna.
3. Identifique a cláusula `WHERE` com `OR` entre colunas diferentes.
4. Reescreva a consulta:
   - Divida em duas consultas separadas, cada uma com uma condição.
   - Utilize `UNION ALL` para combinar os resultados (nunca `UNION`, para evitar overhead de deduplicação).
   - Adicione uma condição na segunda parte para evitar duplicatas quando ambas as colunas tiverem o mesmo valor (ex: `AND Email <> @Busca`), garantindo que uma linha não apareça duas vezes se ambas as condições forem verdadeiras.
   - Se você quiser manter duplicatas (por exemplo, quando a linha pode ser retornada por ambos os filtros e isso é intencional), omita a condição adicional.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita do `OR` para `UNION ALL`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes nas colunas, mencione isso.
   - Se faltar índices em alguma das colunas, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Uso de `OR` entre colunas diferentes, forçando Index Scan.

```sql
-- Exemplo extraído do PDF: Buscar usuário por Email ou Login
DECLARE @Busca VARCHAR(100) = 'joao@email.com';

SELECT Id, Nome
FROM Usuarios
WHERE Email = @Busca
   OR Login = @Busca;
```

**Solução (DEPOIS):** Dividir em duas consultas com `UNION ALL`.

```sql
DECLARE @Busca VARCHAR(100) = 'joao@email.com';

SELECT Id, Nome
FROM Usuarios
WHERE Email = @Busca

UNION ALL

SELECT Id, Nome
FROM Usuarios
WHERE Login = @Busca
  AND Email <> @Busca; -- Evita duplicatas quando Email = Login
```

**Motivo:** O `OR` entre colunas diferentes impede o otimizador de usar mais de um índice de forma eficiente. O plano gerado frequentemente envolve um **Index Scan** (leitura completa da tabela) ou uma combinação ineficiente de operadores. Ao dividir a consulta em duas partes com `UNION ALL`, cada parte pode usar seu próprio índice para fazer um **Index Seek** (busca pontual), que é muito mais rápido. O `UNION ALL` (em vez de `UNION`) é fundamental porque evita a etapa de ordenação e deduplicação (`DISTINCT`), que seria um custo extra desnecessário.

**Atenção à duplicata:** Se ambas as colunas tiverem o mesmo valor (ex: `Email = 'joao@email.com'` e `Login = 'joao@email.com'`), a linha apareceria duas vezes sem a condição adicional `AND Email <> @Busca`. A condição garante que a segunda parte só traga linhas que não foram capturadas pela primeira, mantendo o mesmo resultado da consulta original.

## Recomendação

- **Sempre** use `UNION ALL` em vez de `UNION` ao dividir `OR` entre colunas. A deduplicação via `UNION` é cara e geralmente desnecessária, especialmente se você adicionar a condição anti-duplicata.
- **Condição anti-duplicata:** Inclua `AND coluna1 <> @Busca` na segunda parte (ou a inversa) para garantir que o resultado final seja idêntico ao da consulta original.
- **Verifique índices:** Cada coluna filtrada deve ter um índice para que o `UNION ALL` seja eficaz. Se faltar, emita o handoff para `create_assertive_index`.
- **Múltiplas colunas:** Se houver mais de duas colunas, você pode estender a técnica com várias partes `UNION ALL`, cada uma com sua própria condição e a devida exclusão de duplicatas (ex: `AND coluna1 <> @Busca AND coluna2 <> @Busca` etc.).
- **Quando usar `OR`:** Apenas use `OR` diretamente quando as colunas forem iguais ou quando o volume de dados for muito pequeno e o custo de reescrita não compensar.

---
**⚠️ Importante:** O padrão de `OR` entre colunas diferentes é uma das principais causas de degradação de performance em sistemas de busca. A reescrita para `UNION ALL` é uma técnica simples que frequentemente transforma um Scan completo em dois Seeks rápidos. Sempre avalie o plano de execução antes e depois para confirmar a melhoria.