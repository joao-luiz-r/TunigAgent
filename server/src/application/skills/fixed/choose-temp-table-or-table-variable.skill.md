---
name: choose_temp_table_or_table_variable
description: Detecta o uso de variáveis de tabela (@tabela) em cenários com volume de dados superior a 100 linhas ou com junções complexas, e recomenda a substituição por tabelas temporárias (#tabela) para obter estatísticas precisas, suporte a índices e melhor performance.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - variavel de tabela
  - table variable
  - acima de 100 linhas
  - volume superior a 100
  - trocar variavel de tabela
  - tabela temporaria no lugar da variavel
  - @tabela
---

# Skill: choose_temp_table_or_table_variable

## Quando usar

Use quando uma consulta ou procedimento armazenado utilizar **variáveis de tabela** (`@tabela`) para armazenar conjuntos de dados que serão usados em junções, filtros ou agregações com outras tabelas.

**Mito comum:** Variáveis de tabela rodam apenas em memória.

**⚠️ NÃO confunda com `avoid_large_temp_tables`:** esta skill decide **entre `@tabela` (variável de tabela) e `#tabela` (tabela temporária)** com base no volume. A skill `avoid_large_temp_tables` trata um problema **diferente**: quando uma `#tabela` já escolhida é criada com volume excessivo ou `SELECT *` sem filtro (recomenda filtrar cedo e selecionar só colunas necessárias). Use esta skill (`choose_temp_table_or_table_variable`) para a troca de estrutura; use `avoid_large_temp_tables` para otimizar o conteúdo/população de uma temporária já existente.

**Realidade:** Variáveis de tabela também usam o `tempdb` e podem sofrer contenção, assim como qualquer outro objeto temporário. Além disso, elas **não possuem estatísticas detalhadas** (apenas uma estimativa fixa de 1 linha, mesmo após o SQL Server 2019 com Table Variable Deferred Compilation, que melhora a estimativa para a realidade, mas ainda não fornece distribuição de dados como tabelas temporárias). Isso faz com que o otimizador subestime o número de linhas, escolhendo planos ineficientes (ex: Nested Loops em vez de Hash Match) quando o volume cresce.

## Instruções

Sua missão é identificar o uso de variáveis de tabela em contextos onde o volume de dados é significativo (acima de ~100 linhas) ou onde há junções complexas, e recomendar a substituição por tabelas temporárias (`#tabela`), que oferecem:

- Estatísticas de distribuição (para o otimizador tomar decisões precisas)
- Suporte a índices explícitos (criação de `CREATE INDEX` após a carga)
- Melhor performance em junções e ordenações

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Identifique variáveis de tabela (`DECLARE @tabela TABLE (...)`):
   - Verifique quantas linhas são inseridas na variável.
   - Avalie se a variável é usada em junções com outras tabelas (ex: `FROM @tabela t JOIN tabela_grande tg ON ...`).
   - Verifique se há operações de ordenação (`ORDER BY`, `GROUP BY`) ou agregações envolvendo a variável.
4. Se o volume for maior que ~100 linhas ou se houver junções complexas, recomende a substituição:
   - Troque `DECLARE @tabela TABLE (...)` por `CREATE TABLE #tabela (...)`.
   - Substitua `INSERT INTO @tabela` por `INSERT INTO #tabela`.
   - Se necessário, crie índices na tabela temporária após a carga (ex: `CREATE INDEX idx ON #tabela(coluna)`).
   - Adapte as referências à variável para usar `#tabela`.
5. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da escolha entre variável de tabela e tabela temporária. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice em tabelas permanentes (`CREATE INDEX`).
   - Se a reescrita para tabela temporária permitir o uso de índices existentes em outras tabelas, mencione isso.
   - Se a consulta puder se beneficiar de índices adicionais na tabela temporária, recomende a criação (`CREATE INDEX #tabela`), mas isso é considerado parte da reescrita – não emita handoff para `create_assertive_index` neste caso, pois índices em tabelas temporárias não são cobertos pela skill de índices permanentes.
   - NUNCA emita um script `CREATE INDEX` em tabelas permanentes diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Uso de variável de tabela com muitas linhas, gerando planos subótimos.

```sql
-- Variável de tabela recebendo muitos registros
DECLARE @pedidos TABLE (
    id_pedido INT PRIMARY KEY,
    id_cliente INT,
    valor DECIMAL(10,2)
);

INSERT INTO @pedidos (id_pedido, id_cliente, valor)
SELECT id, id_cliente, valor_total
FROM pedidos
WHERE data_pedido >= '2023-01-01';

-- Junção com tabela grande, onde o otimizador estima que @pedidos tem 1 linha
SELECT c.nome, SUM(p.valor) AS total
FROM @pedidos p
JOIN clientes c ON c.id_cliente = p.id_cliente
GROUP BY c.nome;
```

**Solução (DEPOIS):** Substituir por tabela temporária, que gera estatísticas e permite índices.

```sql
-- Tabela temporária com estatísticas reais
CREATE TABLE #pedidos (
    id_pedido INT PRIMARY KEY,
    id_cliente INT,
    valor DECIMAL(10,2)
);

INSERT INTO #pedidos (id_pedido, id_cliente, valor)
SELECT id, id_cliente, valor_total
FROM pedidos
WHERE data_pedido >= '2023-01-01';

-- Criação de índice adicional para otimizar a junção
CREATE INDEX idx_cliente ON #pedidos (id_cliente);

-- Junção com cliente (agora com estatísticas precisas)
SELECT c.nome, SUM(p.valor) AS total
FROM #pedidos p
JOIN clientes c ON c.id_cliente = p.id_cliente
GROUP BY c.nome;

-- Opcional: ao final, descartar a tabela (ela é automaticamente descartada ao fim da sessão)
DROP TABLE #pedidos;
```

**Motivo:** Variáveis de tabela não geram estatísticas de distribuição (apenas uma estimativa fixa). Mesmo com a "Table Variable Deferred Compilation" do SQL Server 2019, que melhora a estimativa inicial, elas ainda não mantêm histogramas detalhados como tabelas temporárias. Quando o volume de dados cresce (mais de 100 linhas), o otimizador subestima o número de linhas, escolhendo operadores como **Nested Loops** (que esperam poucas linhas) em vez de **Hash Match** ou **Merge Join** (mais adequados para grandes conjuntos). Além disso, você não pode criar índices em variáveis de tabela (apenas PRIMARY KEY e UNIQUE como parte da definição), o que limita a eficiência de buscas adicionais.

## Recomendação

- **Regra de bolso:**
  - **@tabela** → até 100 linhas, sem necessidade de índices adicionais, operações simples.
  - **#tabela** → acima de 100 linhas, junções complexas, necessidade de estatísticas reais e índices extras.

- **Sempre** que o volume não for conhecido ou puder crescer, use tabela temporária.
- **Estatísticas:** Tabelas temporárias geram estatísticas automaticamente (como tabelas permanentes), permitindo que o otimizador escolha os melhores operadores.
- **Índices:** Você pode criar índices em tabelas temporárias após a carga para acelerar junções e buscas:
  ```sql
  CREATE INDEX idx_nome ON #tabela (coluna);
  ```
- **Escopo:** Tabelas temporárias são visíveis apenas na sessão atual e são descartadas automaticamente ao final, então não se preocupe com limpeza manual (embora seja boa prática `DROP TABLE`).
- **Monitoramento:** Verifique o plano de execução antes e depois da substituição para confirmar a melhoria (especialmente a troca de Nested Loops por Hash Match).

---
**⚠️ Importante:** O uso de variáveis de tabela é aceitável e até recomendado para conjuntos pequenos e estáveis, pois elas podem reduzir contenção no `tempdb` em cenários de alta concorrência. No entanto, para volumes maiores, a tabela temporária é sempre a melhor escolha. Avalie o cenário com cuidado.