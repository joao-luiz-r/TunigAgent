---
name: handle_nulls_in_aggregate_expressions
description: Detecta expressões aritméticas dentro de funções de agregação (SUM, AVG, COUNT, etc.) onde colunas podem conter NULL, o que faz a expressão inteira avaliar para NULL e a linha ser silenciosamente ignorada na agregação. Recomenda o uso de ISNULL ou COALESCE para tratar NULLs antes da agregação, garantindo resultados corretos e completos.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - null na agregacao
  - sum com null
  - expressao de agregacao com null
  - isnull na agregacao
  - nada na soma por null
  - nulls em funcao de agregacao
---

# Skill: handle_nulls_in_aggregate_expressions

## Quando usar

Use quando uma função de agregação (`SUM`, `AVG`, `COUNT`, `MIN`, `MAX`) contiver uma **expressão aritmética** envolvendo colunas que podem ser `NULL`, como por exemplo:

- `SUM(ValorProduto + ValorFrete)`
- `AVG(PrecoUnitario * Quantidade)`
- `COUNT(Coluna1 + Coluna2)`
- `SUM(ValorVenda - ValorCusto)`
- `AVG(CampoA / CampoB)` (divisão por zero também é um risco, mas o foco aqui é NULL)

**O perigo:** Funções de agregação ignoram `NULL` por padrão. No entanto, se um `NULL` estiver presente **dentro da expressão** que está sendo agregada, a expressão inteira se torna `NULL`, e a função de agregação ignora silenciosamente **a linha inteira**. Isso pode levar a resultados incorretos ou incompletos **sem nenhum erro ou aviso**.

**Exemplo do problema:**

```sql
-- Se ValorFrete for NULL, a expressão ValorProduto + ValorFrete se torna NULL,
-- e SUM() ignora essa linha completamente.
SELECT SUM(ValorProduto + ValorFrete) AS SomaTotal FROM Transacoes;
```

**Solução robusta:** Use `ISNULL()` ou `COALESCE()` nos campos que podem ser `NULL` dentro da expressão, para convertê-los em um valor padrão (geralmente 0) antes da operação aritmética e da agregação.

## Instruções

Sua missão é identificar expressões aritméticas dentro de funções de agregação que envolvem colunas com potencial `NULL`, e reescrevê-las utilizando `ISNULL()` ou `COALESCE()` para garantir que todas as linhas sejam consideradas.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Identifique funções de agregação (`SUM`, `AVG`, `COUNT`, etc.) que contenham expressões aritméticas (ex: `coluna1 + coluna2`, `coluna1 - coluna2`, `coluna1 * coluna2`, `coluna1 / coluna2`).
4. Verifique se alguma das colunas na expressão pode conter `NULL` (ex: coluna não tem `NOT NULL`).
5. Reescreva a expressão:
   - Use `ISNULL(coluna, 0)` ou `COALESCE(coluna, 0)` para cada coluna que possa ser `NULL`.
   - Mantenha a estrutura da expressão aritmética.
   - Se a lógica de negócio exigir um valor diferente de 0 para `NULL` (ex: frete grátis = 0, desconto = 0, etc.), ajuste o valor padrão conforme necessário.
6. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da correção de expressões agregadas. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes (ex: índices nas colunas envolvidas), mencione isso.
   - Se faltar índices para otimizar a consulta agregada, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Expressão aritmética com NULL dentro de SUM, ignorando linhas.

```sql
-- Tabela com ValorFrete NULL (frete grátis)
CREATE TABLE Transacoes (
    IDTransacao INT PRIMARY KEY,
    ValorProduto DECIMAL(10,2) NOT NULL,
    ValorFrete DECIMAL(10,2) NULL
);

INSERT INTO Transacoes VALUES
(1, 100.00, 10.00),   -- Valor total: 110
(2, 50.00, NULL),     -- Valor total esperado: 50 (frete grátis)
(3, 200.00, 20.00),   -- Valor total: 220
(4, 75.00, 5.00);     -- Valor total: 80

-- Query problemática: NULL em ValorFrete faz a Transacao 2 ser ignorada!
SELECT SUM(ValorProduto + ValorFrete) AS SomaTotal
FROM Transacoes;
-- Resultado: 410.00 (ignorou a transação 2)
```

**Solução (DEPOIS):** Usar ISNULL ou COALESCE para tratar NULL como 0.

```sql
-- Tratando NULL em ValorFrete como 0
SELECT SUM(ISNULL(ValorProduto, 0) + ISNULL(ValorFrete, 0)) AS SomaTotal
FROM Transacoes;
-- Resultado: 460.00 (inclui a transação 2 corretamente)

-- Alternativa com COALESCE
SELECT SUM(COALESCE(ValorProduto, 0) + COALESCE(ValorFrete, 0)) AS SomaTotal
FROM Transacoes;
-- Resultado: 460.00
```

**Motivo:** O comportamento silencioso do `NULL` em expressões aritméticas é uma das armadilhas mais perigosas em SQL. Quando `ValorFrete` é `NULL`, a expressão `ValorProduto + ValorFrete` se torna `NULL`. Como `SUM()` ignora `NULL`s, a linha inteira da transação 2 não é considerada no cálculo, e o resultado fica incorreto sem nenhum erro. Ao usar `ISNULL(ValorFrete, 0)`, convertemos `NULL` para 0, garantindo que a expressão seja avaliada corretamente e que a linha seja incluída na agregação.

## Recomendação

- **Sempre** verifique se colunas usadas em expressões aritméticas dentro de agregações podem ser `NULL`.
- **Use `ISNULL` ou `COALESCE`** no campo que pode ser `NULL` dentro da expressão, **antes** da operação aritmética.
- **Escolha o valor padrão adequado:** 0 geralmente é apropriado para somas e médias, mas pode variar conforme a lógica de negócio (ex: 1 para contagens, ou um valor específico).
- **Atenção ao `AVG`:** Se você tratar `NULL` como 0 para `AVG`, isso pode distorcer a média, pois inclui zeros como valores reais. Avalie se a média deve considerar apenas valores não `NULL` ou se zeros devem ser incluídos.
- **Outros agregados:** `COUNT(coluna)` já ignora `NULL`s diretamente, mas `COUNT(expressão)` pode ser afetado se a expressão resultar em `NULL`. Use `COUNT(CASE WHEN ...)` se precisar contar apenas valores não `NULL`.
- **Teste com dados:** Sempre teste a consulta com dados que incluem `NULL` para confirmar que a lógica está correta e que nenhuma linha está sendo silenciosamente ignorada.

---
**⚠️ Importante:** O problema de `NULL` em expressões agregadas é uma das causas mais comuns de bugs de relatórios e análises. O comportamento silencioso torna ainda mais perigoso, pois o resultado parece correto, mas está incompleto. Use `ISNULL` ou `COALESCE` sempre que houver potencial `NULL` em expressões aritméticas dentro de funções de agregação.