# Diretrizes de Desenvolvimento - Frontend (client)

Regras específicas para desenvolvimento, interface e experiência do usuário (UI/UX) do TunigAgent.

---

## 🎨 Design System & Estética
- **Framework & Build:** React 18 + Vite em ECMAScript Modules.
- **Tipografia & Paleta:** Utilize fontes modernas e legíveis (ex.: Inter, Roboto Mono para blocos SQL). Evite cores primárias puras; adote paletas balanceadas e harmoniosas com modo escuro nativo.
- **Feedback & Microinterações:**
  - Botão de "Copiar Script" T-SQL com feedback visual temporário (ícone de check).
  - Skeletons de carregamento nos painéis e listas em vez de spinners genéricos.
  - Animações e transições suaves entre estados da sessão (`PENSANDO`, `AGUARDANDO DADO...`).

---

## 🧭 Apresentação dos Dados de Tuning
1. **Destaque de Sintaxe SQL:** Toda query, script de coleta e recomendação técnica deve ser renderizada com formatação e syntax-highlighting adequado.
2. **Comparação Visual ANTES / DEPOIS:** Nas recomendações de tuning, renderize visualmente as alterações de SQL destacando as linhas alteradas (diff visual).
3. **Indicador de Skill Ativa:** Exibir distintivo persistente ou cabeçalho indicando qual técnica/skill de diagnóstico está sendo aplicada na sessão atual.
4. **Histórico da Conversa Recolhível:** Agrupar tools chamadas e seus resultados em nós colapsáveis para manter a conversa limpa e focada nas decisões.

---

## ⚙️ Conectividade e Resiliência
- **Camada de API:** Mantenha chamadas HTTP isoladas em módulos de serviço (`client/src/services/api.js`).
- **Resiliência a Erros:** Trate quedas de conexão ou respostas incompletas com mensagens amigáveis e opção de reenvio, sem travar a interface da sessão.
- **Persistência Local:** Salve preferências visuais do usuário (ex.: tema claro/escuro, largura de painéis) em `localStorage`.
