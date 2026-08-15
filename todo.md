1 - Testes para cobrir as regras de negócio das skills
2 - Uma forma simples de trocar a LLM de Deepseek para copilot
3 - teste com uma query complexa com vários problemas de performance para verificar se as skills estão sendo chamadas corretamente
4 - teste de cobertura para todos os pontos do harness
5 - gravar histórico de sessões do usuário e permitir prosseguir com a sessão
6 - permitir que o usuário exclua uma sessão do histórico
7 - criar teste para a skill-factory
8 - permitir uploas de arquivos SQL com queries ou stored procedures
9 - permitir upload de arquivos XML ou sqlplan com planos de execução
10 - Painel web de sessões: listar, retomar e exportar análises com um clique
11 - Gerar relatório final em Markdown/PDF com as recomendações de cada sessão (download)
12 - Comparação visual ANTES/DEPOIS do plano de execução (árvore de operadores a partir do XML)
13 - Estimativa de impacto de cada recomendação (redução estimada de I/O, CPU e tempo)
14 - Botão "Aplicar recomendação" que gera o script pronto para revisão e execução pelo DBA
15 - Feedback de satisfação por recomendação (gostei/não gostei) para calibrar o matcher
16 - Biblioteca de queries de exemplo agrupadas por problema para demonstrar cada skill
17 - Modo batch: analisar várias queries de uma lista dentro de uma única sessão
18 - Visualizar e editar a skill ativa em tempo real (instruções + tools) sem reiniciar o servidor
19 - Comparar recomendações de skills diferentes para a mesma query e escolher a melhor
20 - Explicação "Por que essa skill?" mostrando o raciocínio do roteamento a cada mensagem
21 - Índice de qualidade das skills: % de vezes que a skill resultou em recomendação aceita
22 - Modo sandbox que executa os scripts gerados em um banco de testes isolado
23 - Verificação de regressão: comparar plano/performance antes e depois de aplicar a skill
24 - Dashboard de waits e top queries com drill-down para a skill adequada
25 - Guardrail: exigir confirmação explícita antes de qualquer script DDL sugerido
26 - API REST exposta e documentada (Swagger/OpenAPI) para integração externa
27 - Comando CLI interativo reutilizando a mesma engine para quem prefere terminal
28 - Deploy facilitado via Docker (Dockerfile + compose para servidor e dependências)
29 - Configuração de providers pela interface (adicionar chave, alternar deepseek/copilot sem deploy)
30 - Autenticação multi-usuário com papéis (analista, DBA, admin)
31 - Audit log de todas as ações (tools chamadas, scripts gerados, recomendações emitidas)
32 - Cache persistente dos resultados de tools (índices/estatísticas) com expiração por tempo
33 - Detecção da versão do SQL Server/Azure para ajustar recomendações (ONLINE, compressão etc.)
34 - Análise de stored procedures inteiras decompondo cada statement para a skill adequada
35 - Catálogo de skills navegável com ANTES/DEPOIS, keywords e tools usadas
36 - Persistência da sessão em SQLite para retomar mesmo após restart do servidor
37 - Testes de regressão automatizados por skill (query canônica -> recomendação esperada)
38 - Versionamento das skills (.md com version) com diff e changelog visível
39 - Integração opcional com Slack/Teams para notificar o fim da análise
