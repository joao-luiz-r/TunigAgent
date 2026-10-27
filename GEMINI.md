# TunigAgent - Diretrizes Globais

Agente autônomo de tuning para SQL Server baseado em LLM e catálogo de habilidades de diagnóstico especializado.

---

## 🌐 Resolução de Ambiguidade de Domínio (Produto vs. IDE)

Este projeto constrói um agente inteligente (`TunigAgent`). Para evitar colisão entre as entidades do **Produto** e as ferramentas de **Desenvolvimento (Antigravity)**:

| Conceito | Domínio do Produto (`TunigAgent`) | Domínio de Desenvolvimento (`Antigravity / IDE`) |
| :--- | :--- | :--- |
| **Skills** | Técnicas de diagnóstico SQL Server (`server/src/application/skills/fixed/*.skill.md`) | Automações e runbooks da IDE em `.agents/skills/<name>/SKILL.md` |
| **Tools** | Geradores de scripts T-SQL (`server/src/application/tools/`) executados pelo usuário | Comandos da IDE (`run_command`, `replace_file_content`, browser) |
| **Harness** | Orquestrador de conversação de tuning (`server/src/application/harness/harness.js`) | Runtime do assistente de IA da IDE |
| **Sessão** | Análise de uma query SQL submetida pelo usuário final | Janela de chat aberta entre você e o assistente de código |

> [!IMPORTANT]
> **Regra de Contexto Padrão:** Qualquer menção a *"Skill"*, *"Tool"*, *"Harness"* ou *"Sessão"* refere-se ao **Produto (TunigAgent)**, a menos que venha explicitamente qualificada com "Antigravity", "IDE" ou "Meta".

---

## 🔒 Guardrails Universais
1. **Zero Conexão Direta ao Banco:** O agente NUNCA deve solicitar ou armazenar string de conexão com o SQL Server. Todas as coletas são feitas exclusivamente via scripts T-SQL gerados para o usuário executar.
2. **Segurança de Credenciais:** Nunca commite chaves de API, arquivos `.env*` ou backups (`*.bak`). Mantenha [.gitignore](file:///.gitignore) estritamente atualizado.
3. **Qualidade & Regressão:** Antes de concluir qualquer tarefa, todos os testes unitários e de integração devem passar com cobertura mínima de 98% (`npm test` e `npm run test:coverage`).
4. **Semântica e Rastreabilidade:** Siga convenções de commits convencionais (`feat:`, `fix:`, `test:`, `refactor:`) e atualize o [todo.md](file:///todo.md) conforme o roadmap avança.

---

## 🧭 Índice de Regras por Domínio (Progressive Disclosure)

Consulte as diretrizes específicas de cada domínio antes de implementar:

| Domínio | Escopo | Arquivo de Regras |
| :--- | :--- | :--- |
| **Backend & Harness** | Node.js, Clean Arch, LLM Client, Skills & Tools | [.agents/rules/backend.md](file:///.agents/rules/backend.md) |
| **Frontend & UI** | React 18, Vite, Estados de Sessão, Tema & UX | [.agents/rules/frontend.md](file:///.agents/rules/frontend.md) |
| **Especificações** | Arquitetura completa, glossário e fluxos | [ESPECIFICACOES.md](file:///ESPECIFICACOES.md) |
| **Roadmap de Fases** | Fases 1 a 5 e status de entregas | [todo.md](file:///todo.md) |

---

## 🛠️ Comandos Rápidos Raiz
- `npm test`: Executa a suíte de testes completa do servidor
- `npm run test:coverage`: Valida o relatório de cobertura de testes
- `npm run dev:server`: Inicia o servidor em modo watch
- `npm run dev:client`: Inicia o frontend Vite
