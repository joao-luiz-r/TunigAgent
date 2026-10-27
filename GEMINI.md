# TunigAgent - Diretrizes Globais

Agente autônomo de tuning para SQL Server baseado em LLM e catálogo de habilidades de diagnóstico especializado.

---

## 🔒 Guardrails Universais
1. **Zero Conexão Direta ao Banco:** O agente NUNCA deve solicitar ou armazenar string de conexão com o SQL Server. Todas as coletas são feitas exclusivamente via scripts T-SQL gerados para o usuário executar.
2. **Segurança de Credenciais:** Nunca commite chaves de API, arquivos `.env*` ou backups (`*.bak`). Mantenha [.gitignore](file:///.gitignore) estritamente atualizado.
3. **Qualidade & Regressão:** Antes de concluir qualquer tarefa, todos os testes unitários e de integração devem passar com cobertura mínima de 98% (`npm test` e `npm run test:coverage`).
4. **Semântica e Rastreabilidade:** Siga convenções de commits convencionais (`feat:`, `fix:`, `test:`, `refactor:`) e atualize o [todo.md](file:///todo.md) conforme o roadmap avança.

---

## 🧭 Índice de Regras por Escopo (Progressive Disclosure)

Consulte as regras detalhadas de cada domínio antes de implementar:

| Domínio | Escopo | Arquivo de Regras |
| :--- | :--- | :--- |
| **Backend & Harness** | Node.js, Clean Arch, LLM Client, Skills & Tools | [server/GEMINI.md](file:///server/GEMINI.md) |
| **Frontend & UI** | React 18, Vite, Estados de Sessão, Tema & UX | [client/GEMINI.md](file:///client/GEMINI.md) |
| **Especificações** | Arquitetura completa, glossário e fluxos | [ESPECIFICACOES.md](file:///ESPECIFICACOES.md) |
| **Roadmap de Fases** | Fases 1 a 5 e status de entregas | [todo.md](file:///todo.md) |

---

## 🛠️ Comandos Rápidos Raiz
- `npm test`: Executa a suíte de testes completa do servidor
- `npm run test:coverage`: Valida o relatório de cobertura de testes
- `npm run dev:server`: Inicia o servidor em modo watch
- `npm run dev:client`: Inicia o frontend Vite
