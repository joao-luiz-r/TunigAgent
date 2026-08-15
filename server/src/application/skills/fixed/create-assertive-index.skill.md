---
name: create_assertive_index
description: Cria ou melhora índices de forma assertiva, verificando os índices existentes e aproveitando/expandindo-os (sem alterar a ordem das colunas-chave) ou criando novos, com FILLFACTOR 90, PAD_INDEX ON, DATA_COMPRESSION PAGE e ONLINE ON.
tools:
  - get_table_indexes
  - get_query_text
keywords:
  - criar indice
  - create index
  - criar um indice de cobertura
  - indice com include
  - criar indice novo
---

# Skill: create_assertive_index

## Quando usar

Use SEMPRE que o agente concluir que a consulta pode se beneficiar de um índice que não existe, ou que um índice existente pode ser melhorado. Esta skill pode ser acionada diretamente pelo usuário ou por outra skill via handoff (`[SKILL_HANDOFF:create_assertive_index]`).

## Instruções

Sua missão é decidir com segurança se um índice deve ser criado, alterado ou deixado como está, respeitando o que já existe. **NUNCA proponha `CREATE INDEX` sem antes coletar os índices existentes da tabela.**

Fluxo obrigatório:

1. Colete os índices existentes da tabela alvo com `get_table_indexes`. Se a tabela não for conhecida, colete o texto da consulta com `get_query_text` para identificar a tabela e as colunas usadas.
2. Compare o índice desejado com os existentes e decida entre:
   - **Aproveitar (nada a fazer):** se um índice existente já cobre a consulta (mesma coluna-líder com INCLUDE suficiente).
   - **Melhorar um índice existente:** se a consulta usa colunas que não estão no índice, SEM alterar a ordem das colunas-chave já existentes.
   - **Criar um novo índice:** se nenhum índice existente pode ser aproveitado.

### Regras de melhoria de índice existente (sem quebrar usabilidade antiga)

- **A ordem dos campos da chave NÃO pode ser alterada.** Colunas existentes na chave mantêm exatamente a mesma posição.
- **Podem ser APPENDADAS novas colunas ao final da chave**, desde que não dupliquem colunas já presentes.
- **A cláusula INCLUDE pode ser acrescentada ou expandida** com mais campos, sem remover campos existentes.
- **NÃO repita a chave primária no INCLUDE**: a PK já existe automaticamente no nível folha de qualquer índice nonclustered.
- **INCLUDE enxuto:** inclua apenas as colunas necessárias para cobrir a consulta. Não coloque dezenas de campos — não duplique a tabela.
- Se a alteração for em um índice existente, a recomendação usa `ALTER INDEX ... REBUILD` ou `CREATE INDEX ... WITH (DROP_EXISTING = ON)` preservando as colunas atuais + acréscimos.

### Parâmetros de criação (sempre usar)

```sql
CREATE INDEX IX_{Tabela}_{Colunas}
ON {Tabela} ({ColunasChave})
INCLUDE ({ColunasAdicionais})
WITH (FILLFACTOR = 90, PAD_INDEX = ON, DATA_COMPRESSION = PAGE, ONLINE = ON);
```

- `ONLINE = ON` bloqueia menos, mas exige edição compatível; se o ambiente não suportar, avise que ONLINE pode ser removido.
- Ao melhorar um índice existente: `CREATE INDEX ... WITH (DROP_EXISTING = ON, FILLFACTOR = 90, PAD_INDEX = ON, DATA_COMPRESSION = PAGE, ONLINE = ON)`.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** A consulta faz scan pesado ou Key Lookup porque não existe um índice adequado, ou o índice existente não cobre todas as colunas usadas.

**Solução (DEPOIS):** Criar um novo índice de cobertura enxuto, ou expandir um índice existente preservando a ordem das colunas-chave e acrescentando colunas ao final da chave / à cláusula INCLUDE.

**Script ANTES:**

```sql
-- Consulta frequente: só existe índice em (Uf)
SELECT PedidoId, ClienteId, Valor, DataVenda
FROM Clientes
WHERE Uf = 'SP'
ORDER BY Nome;
```

**Script DEPOIS (expandindo o índice existente em (Uf)):**

```sql
CREATE INDEX IX_Clientes_Uf
ON dbo.Clientes (Uf, Nome)
INCLUDE (Cidade, Valor, DataVenda)
WITH (DROP_EXISTING = ON, FILLFACTOR = 90, PAD_INDEX = ON, DATA_COMPRESSION = PAGE, ONLINE = ON);
```

**Motivo:** Aproveitar o índice existente mantendo sua chave atual (usabilidade antiga intacta) e adicionar as colunas que faltam para cobrir a consulta converte scan em seek e elimina Key Lookups, reduzindo o I/O sem duplicar estruturas.

## Recomendação

Sugerir o índice em {tabela} com colunas-chave {colunas_chave} e INCLUDE ({colunas_incluidas}), usando `WITH (FILLFACTOR = 90, PAD_INDEX = ON, DATA_COMPRESSION = PAGE, ONLINE = ON)`. Se um índice existente já cobre a consulta, informe que não é necessário criar. Se for uma melhoria, preserve a ordem das colunas-chave existentes e apenas acrescente ao final da chave ou expanda o INCLUDE. Nunca duplique a PK no INCLUDE.
