---
name: markdown-preview
description: Visualiza arquivos Markdown (.md e .skill.md) do projeto no navegador com tema escuro (Dark Theme), syntax-highlighting de SQL e atualização em tempo real (F5 ou ao salvar).
---

# Markdown Dark Previewer

Ferramenta do Antigravity para renderizar e visualizar qualquer arquivo Markdown do repositório em um navegador com tema escuro elegante (GitHub Dark), suporte a alertas do GitHub (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`), syntax-highlighting para T-SQL/SQL, JSON e cópia rápida de código.

## Quando usar
- O usuário pedir para visualizar, ler ou abrir um arquivo `.md` ou `.skill.md` no navegador.
- O usuário quiser inspecionar a documentação, o `todo.md`, as regras ou especificações técnicas com visual rico.

## Como acionar
Para iniciar o visualizador apontando para um arquivo específico:
```powershell
npm run preview:md -- <caminho_do_arquivo>
```

Exemplos:
- `npm run preview:md -- todo.md`
- `npm run preview:md -- GEMINI.md`
- `npm run preview:md -- ESPECIFICACOES.md`
- `npm run preview:md -- server/src/application/skills/fixed/avoid-select-star.skill.md`

Sem argumentos, ele abre com `todo.md` por padrão e permite navegar por qualquer outro arquivo `.md` do workspace via seletor no topo da página.

## Características
1. **Zero dependências externas instaladas:** Utiliza o runtime nativo do Node.js (`node:http`, `node:fs`).
2. **Atualização imediata com F5:** O arquivo é lido diretamente do disco em cada requisição.
3. **Auto-reload inteligente:** Polling a cada 1 segundo detecta quando o arquivo foi salvo no editor e atualiza a visualização preservando a posição da rolagem.
4. **Navegação completa:** Menu dropdown no topo para alternar entre todos os arquivos `.md` e `.skill.md` do repositório.
