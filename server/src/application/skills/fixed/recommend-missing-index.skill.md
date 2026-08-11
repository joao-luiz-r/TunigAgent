---
name: recommend_missing_index
description: Identifica índices de cobertura que faltam comparando a consulta com os índices já existentes da tabela e propõe índices respeitando o que já existe, com FILLFACTOR 90, PAD_INDEX ON, DATA_COMPRESSION PAGE e ONLINE ON.
tools:
  - get_table_indexes
  - get_query_text
---

# Skill: recommend_missing_index

## Quando usar

Use quando a análise do texto da consulta e dos índices existentes indica que consultas frequentes poderiam ter performance muito melhor com um índice dedicado (cobertura ausente, scans ou key lookups).

## Instruções

Sua missão é identificar índices que faltam comparando a consulta com os índices existentes da tabela e transformá-los em índices de cobertura bem construídos. O diagnóstico é feito pela análise do texto da consulta (colunas de predicado, join e select) contra o que já existe.

Fluxo obrigatório antes de propor um índice:

1. Colete o texto da consulta com `get_query_text` para identificar a tabela e as colunas usadas em WHERE, JOIN e SELECT.
2. Para cada tabela alvo, colete os índices existentes com `get_table_indexes`.
3. Compare as colunas usadas com os existentes e descarte qualquer proposta redundante (mesma coluna-líder, ou cobertura já garantida por um índice existente). A resposta deve citar o índice existente que torna a criação desnecessária, quando for o caso.
4. Se o índice de cobertura ainda for necessário, proponha o `CREATE INDEX` final com os parâmetros abaixo.

Regras de construção do índice de cobertura:

- **Chave do índice:** apenas as colunas de igualdade (e, se houver, uma ou duas de desigualdade/ordenação mais seletivas). Não coloque tudo na chave.
- **INCLUDE enxuto:** inclua SOMENTE as colunas adicionais necessárias para cobrir a consulta. Não duplique a tabela colocando dezenas de campos na cláusula INCLUDE — inclua o mínimo necessário.
- **Não repita a chave primária no INCLUDE:** a PK já existe automaticamente no nível folha de qualquer índice nonclustered, portanto NÃO inclua as colunas da PK na cláusula INCLUDE. Listar a PK no INCLUDE é redundante e aumenta o tamanho do índice sem benefício.
- **Redundância:** se a consulta já é coberta por um índice existente, ou se a coluna-líder do índice proposto já é a coluna-líder de um índice existente com as mesmas colunas, NÃO crie o índice — informe ao usuário.
- **Parâmetros de criação (sempre usar):**
  ```sql
  CREATE INDEX IX_{Tabela}_{Colunas}
  ON {Tabela} ({ColunasChave})
  INCLUDE ({ColunasAdicionais})
  WITH (FILLFACTOR = 90, PAD_INDEX = ON, DATA_COMPRESSION = PAGE, ONLINE = ON);
  ```
- `ONLINE = ON` exige Enterprise/Standard compatível e bloqueia menos; se o ambiente não suportar, avise que ONLINE pode ser removido.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** A consulta usa colunas em WHERE/JOIN/SELECT que não são cobertas pelos índices existentes da tabela, gerando scan pesado ou key lookups, mas a criação precisa respeitar os índices existentes e evitar redundância.

**Solução (DEPOIS):** Criar índices de cobertura enxutos sobre as colunas de igualdade + INCLUDE mínimo, sem repetir a PK, respeitando os índices existentes e usando `WITH (FILLFACTOR = 90, PAD_INDEX = ON, DATA_COMPRESSION = PAGE, ONLINE = ON)`.

**Script ANTES:**

```sql
-- Consulta frequente com scan pesado
SELECT PedidoId, ClienteId, Valor, DataVenda, Uf, Cidade
FROM Clientes
WHERE Uf = 'SP'
ORDER BY Nome;
```

**Script DEPOIS:**

```sql
CREATE INDEX IX_Clientes_Uf_Nome
ON dbo.Clientes (Uf, Nome)
INCLUDE (Cidade, Valor, DataVenda)
WITH (FILLFACTOR = 90, PAD_INDEX = ON, DATA_COMPRESSION = PAGE, ONLINE = ON);
```

**Motivo:** Um índice de cobertura converte scans pesados em seeks e elimina Key Lookups, reduzindo drasticamente o I/O. Manter o INCLUDE enxuto (sem repetir a PK, que já existe no nível folha) e usar FILLFACTOR/compressão/ONLINE reduz o custo de manutenção e o tamanho do índice.

## Recomendação

Criar o índice de cobertura em {tabela} sobre as colunas de igualdade {colunas_igualdade} (+ {colunas_desigualdade} se necessário), com INCLUDE mínimo ({colunas_incluidas}), evitando repetir a PK no INCLUDE e descartando índices redundantes com os já existentes. Use `WITH (FILLFACTOR = 90, PAD_INDEX = ON, DATA_COMPRESSION = PAGE, ONLINE = ON)` para reduzir o custo de I/O. Se os índices existentes já cobrem a consulta, informe que a criação é desnecessária.
