---
name: avoid_varchar_max
description: Detecta colunas, variáveis e parâmetros declarados como VARCHAR(MAX) que poderiam ser VARCHAR(n), causando armazenamento out-of-row, maior I/O, impossibilidade de uso como chave de índice e planos subótimos. Recomenda a definição do menor tamanho possível para melhorar performance e reduzir custos.
tools:
  - get_query_text
  - get_table_indexes
  - get_table_schema
keywords:
  - varchar max
  - varchar(max)
  - coluna varchar max
  - armazenamento out of row
  - usar varchar n
  - largura variavel maxima
---

# Skill: avoid_varchar_max

## Quando usar

Use quando uma coluna, variável ou parâmetro for declarado como `VARCHAR(MAX)` (ou `NVARCHAR(MAX)`) sem uma justificativa clara para armazenar dados muito grandes (acima de 8.000 caracteres). O uso indiscriminado de `VARCHAR(MAX)` é uma prática comum e perigosa que pode degradar a performance de forma silenciosa.

**O problema:** O SQL Server trata `VARCHAR(MAX)` como um **Large Object (LOB)** – o mesmo tipo de dados usado para `TEXT`, `IMAGE` e `VARBINARY(MAX)`. Isso traz implicações sérias:

- **Armazenamento out-of-row:** Dados acima de ~8.000 caracteres são armazenados em páginas separadas, exigindo leituras adicionais para acessá-los.
- **Overhead na linha:** Mesmo dados pequenos armazenados em `VARCHAR(MAX)` geram um ponteiro de 24 bytes na linha, que um `VARCHAR(n)` não teria.
- **Impossibilidade de indexação:** Colunas `VARCHAR(MAX)` não podem ser usadas como colunas-chave em índices (clustered ou non-clustered), forçando *Scans* em vez de *Seeks*.
- **Estimativas imprecisas:** O otimizador considera a possibilidade de dados gigantescos, podendo escolher planos subótimos ou alocar memória em excesso.
- **Maior I/O e CPU:** Acessar dados out-of-row exige leituras de página adicionais, aumentando o custo de cada consulta.

**A solução:** Sempre que possível, use `VARCHAR(n)` com o menor tamanho que acomode os dados esperados. Reserve `VARCHAR(MAX)` apenas para colunas que realmente precisam armazenar mais de 8.000 caracteres (ex: textos longos, documentos, logs extensos).

## Instruções

Sua missão é identificar declarações de `VARCHAR(MAX)` que podem ser substituídas por `VARCHAR(n)` com um tamanho definido, melhorando a performance e a eficiência do banco de dados.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Identifique colunas, variáveis ou parâmetros declarados como `VARCHAR(MAX)` (ou `NVARCHAR(MAX)`).
4. Analise o contexto:
   - Qual é o tamanho máximo real esperado para os dados?
   - A coluna é usada em cláusulas `WHERE`, `JOIN` ou `ORDER BY`? Isso exige indexação?
   - A coluna é usada em índices existentes (como coluna incluída)?
5. Reescreva a definição:
   - Substitua `VARCHAR(MAX)` por `VARCHAR(n)` com um tamanho apropriado (ex: `VARCHAR(200)`, `VARCHAR(1000)`, `VARCHAR(4000)`).
   - Se a coluna não puder ter seu tamanho reduzido (ex: realmente precisa de MAX), documente a justificativa.
6. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da recomendação de ajuste de tipo de dado. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a substituição permitir que a coluna seja usada como chave de índice e isso melhorar a performance, indique essa oportunidade e, se necessário, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Coluna VARCHAR(MAX) declarada por comodidade, sem necessidade real.

```sql
-- Tabela com colunas VARCHAR(MAX) desnecessárias
CREATE TABLE Clientes (
    ClienteID INT PRIMARY KEY,
    Nome VARCHAR(MAX),        -- Nome não precisa de MAX
    Email VARCHAR(MAX),       -- Email não precisa de MAX
    Observacoes VARCHAR(MAX)  -- Observações poderiam ser VARCHAR(2000)
);

-- Índice não pode usar Nome como chave
CREATE INDEX IX_Clientes_Nome ON Clientes(Nome); -- ERRO! Varchar(MAX) não pode ser chave

-- Consulta que poderia usar índice, mas faz Scan
SELECT ClienteID, Nome, Email
FROM Clientes
WHERE Nome LIKE 'Silva%';
```

**Solução (DEPOIS):** Usar tamanhos adequados para cada coluna.

```sql
-- Tabela com tamanhos específicos
CREATE TABLE Clientes (
    ClienteID INT PRIMARY KEY,
    Nome VARCHAR(200) NOT NULL,      -- Nome com tamanho adequado
    Email VARCHAR(255) NOT NULL,     -- Email com tamanho padrão
    Observacoes VARCHAR(2000) NULL   -- Observações com limite razoável
);

-- Agora Nome pode ser usado como chave de índice
CREATE INDEX IX_Clientes_Nome ON Clientes(Nome);

-- Consulta usa Index Seek (se Nome tiver índice)
SELECT ClienteID, Nome, Email
FROM Clientes
WHERE Nome LIKE 'Silva%';
```

**Motivo:** O `VARCHAR(MAX)` é tratado como LOB, com penalidades de performance mesmo para dados pequenos. Ao definir um tamanho máximo realista, você:

- **Garante armazenamento in-row:** Dados permanecem na página de dados principal, eliminando leituras adicionais.
- **Permite indexação:** Colunas com tamanho definido podem ser usadas como chave em índices, permitindo *Index Seeks*.
- **Reduz overhead:** Elimina o ponteiro de 24 bytes na linha.
- **Melhora estimativas:** O otimizador tem informações mais precisas sobre o tamanho dos dados.
- **Reduz I/O e CPU:** Menos páginas para ler e processar.

## Recomendação

- **Regra de ouro:** Use `VARCHAR(n)` com o menor tamanho possível que acomode os dados esperados. Não use `MAX` por comodidade.
- **Tamanhos comuns:** 
  - Nomes: `VARCHAR(100)` a `VARCHAR(200)`
  - Emails: `VARCHAR(255)`
  - URLs: `VARCHAR(500)`
  - Descrições curtas: `VARCHAR(500)` a `VARCHAR(1000)`
  - Descrições longas: `VARCHAR(2000)` a `VARCHAR(4000)` (se <= 8000)
  - Textos muito longos (>8000): aí sim use `VARCHAR(MAX)`
- **Índices:** Se a coluna for usada em `WHERE`, `JOIN` ou `ORDER BY`, um tamanho definido permite indexação eficiente.
- **Migração:** Ao alterar uma coluna de `VARCHAR(MAX)` para `VARCHAR(n)`, verifique se os dados existentes não excedem o novo limite.
- **NVARCHAR:** A mesma regra se aplica ao `NVARCHAR(MAX)` – use `NVARCHAR(n)` sempre que possível.

---
**⚠️ Importante:** A escolha do tipo de dado é uma das decisões mais fundamentais para a performance. Um `VARCHAR(MAX)` desnecessário pode transformar uma coluna simples em um gargalo de I/O, CPU e memória. Seja preciso e seu banco de dados agradecerá.