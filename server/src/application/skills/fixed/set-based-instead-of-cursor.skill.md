---
name: set_based_instead_of_cursor
description: Detecta loops/cursors que processam linha a linha e recomenda reescrever como operação baseada em conjuntos (set-based).
tools:
  - get_query_text
---

# Skill: set_based_instead_of_cursor

## Quando usar

Use quando uma procedure ou consulta usa cursor ou loop WHILE para atualizar/inserir linha a linha, gerando milhares de round-trips ao storage.

## Instruções

Sua missão é identificar processos que percorrem linha a linha (cursors ou WHILE) para realizar operações que podem ser expressas em um único comando baseado em conjuntos. Analise o texto da procedure/consulta recuperado e reescreva usando UPDATE/INSERT/MERGE set-based, preservando a lógica de negócio (joins, filtros e a mesma semântica). Quando o processamento sequencial for genuinamente necessário, avalie alternativas como CTE, `ROW_NUMBER` ou operações em lote (batches). Use a ferramenta `get_query_text`. Conclua com a reescrita.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Cursor ou WHILE que processa linha a linha para atualizar/inserir, com milhares de round-trips e alto overhead.

**Solução (DEPOIS):** Reescrever como UPDATE/INSERT baseado em conjuntos (single statement), mantendo a mesma semântica de negócio.

**Script ANTES:**

```sql
DECLARE @id INT, @salario DECIMAL(10,2)
DECLARE c CURSOR FOR SELECT Id, Salario FROM Funcionarios
OPEN c; FETCH NEXT FROM c INTO @id, @salario
WHILE @@FETCH_STATUS = 0
BEGIN
  UPDATE Funcionarios SET Salario = @salario * 1.1 WHERE Id = @id
  FETCH NEXT FROM c INTO @id, @salario
END
CLOSE c; DEALLOCATE c;
```

**Script DEPOIS:**

```sql
UPDATE Funcionarios SET Salario = Salario * 1.1;
```

**Motivo:** Processamento linha a linha gera milhares de chamadas ao engine; operações set-based usam acesso em massa e aproveitam o otimizador.

## Recomendação

Reescrever o cursor/loop {nome} em {procedimento} como operação set-based usando {tecnica}, reduzindo drasticamente as idas e vindas ao storage.
