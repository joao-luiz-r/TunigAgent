#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3456;

// Arquivo passado por argumento ou padrão
const argFile = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : null;

// Encontra todos os arquivos .md e .skill.md do repositório
function findMarkdownFiles(dir, fileList = []) {
  const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', '.gemini', 'coverage']);
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findMarkdownFiles(fullPath, fileList);
      } else if (entry.name.endsWith('.md')) {
        const relPath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
        fileList.push({
          name: entry.name,
          relPath,
          fullPath,
          isSkill: entry.name.endsWith('.skill.md'),
        });
      }
    }
  } catch (err) {
    // ignora diretórios inacessíveis
  }
  return fileList;
}

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown Dark Viewer | TunigAgent</title>
  <!-- Marked.js para parser de Markdown -->
  <script src="https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js"></script>
  <!-- Highlight.js para destaque de sintaxe SQL, JS, Bash, YAML -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/sql.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/json.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/yaml.min.js"></script>
  <style>
    :root {
      --bg-canvas: #0d1117;
      --bg-panel: #161b22;
      --bg-header: rgba(13, 17, 23, 0.85);
      --border-color: #30363d;
      --border-muted: #21262d;
      --text-main: #e6edf3;
      --text-muted: #8b949e;
      --accent: #58a6ff;
      --accent-hover: #79c0ff;
      --success: #3fb950;
      --warning: #d29922;
      --danger: #f85149;
      --purple: #bc8cff;
      --code-bg: #161b22;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-canvas);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    header {
      background: var(--bg-header);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-color);
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 15px;
      z-index: 100;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;
    }

    .brand-badge {
      background: #1f6feb22;
      color: var(--accent);
      border: 1px solid #1f6feb55;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }

    .file-select-wrapper {
      position: relative;
      flex: 1;
      max-width: 480px;
    }

    select#fileSelector {
      width: 100%;
      background: var(--bg-panel);
      color: var(--text-main);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 13px;
      outline: none;
      cursor: pointer;
      text-overflow: ellipsis;
      transition: border-color 0.2s;
    }

    select#fileSelector:focus {
      border-color: var(--accent);
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .status-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-muted);
      background: var(--bg-panel);
      padding: 4px 10px;
      border-radius: 20px;
      border: 1px solid var(--border-color);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 6px var(--success);
      transition: background 0.3s;
    }

    .btn {
      background: var(--bg-panel);
      color: var(--text-main);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }

    .btn:hover {
      background: #21262d;
      border-color: #8b949e;
    }

    .container {
      flex: 1;
      overflow-y: auto;
      padding: 40px 20px;
      display: flex;
      justify-content: center;
    }

    article#content {
      width: 100%;
      max-width: 900px;
      padding-bottom: 80px;
    }

    /* Estilos GitHub Dark para o Markdown */
    h1, h2, h3, h4, h5, h6 {
      color: #f0f6fc;
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
    }
    h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border-color); }
    h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border-color); }
    h3 { font-size: 1.25em; }
    p { margin-bottom: 16px; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; color: var(--accent-hover); }

    ul, ol {
      margin-bottom: 16px;
      padding-left: 2em;
    }
    li { margin-top: 0.25em; }

    hr {
      height: 0.25em;
      padding: 0;
      margin: 24px 0;
      background-color: var(--border-color);
      border: 0;
    }

    blockquote {
      padding: 0 1em;
      color: var(--text-muted);
      border-left: 0.25em solid var(--border-color);
      margin: 16px 0;
    }

    /* GitHub-style Alerts */
    .alert-box {
      padding: 12px 16px;
      margin: 16px 0;
      border-radius: 6px;
      border-left: 4px solid;
      background: #161b22;
    }
    .alert-box.alert-note { border-color: var(--accent); background: rgba(31, 111, 235, 0.1); }
    .alert-box.alert-tip { border-color: var(--success); background: rgba(63, 185, 80, 0.1); }
    .alert-box.alert-important { border-color: var(--purple); background: rgba(188, 140, 255, 0.1); }
    .alert-box.alert-warning { border-color: var(--warning); background: rgba(210, 153, 34, 0.1); }
    .alert-box.alert-caution { border-color: var(--danger); background: rgba(248, 81, 73, 0.1); }
    .alert-title { font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; font-size: 13px; }

    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
      font-size: 85%;
      background-color: rgba(110, 118, 129, 0.2);
      padding: 0.2em 0.4em;
      border-radius: 6px;
    }

    pre {
      position: relative;
      background-color: var(--code-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 16px;
      overflow: auto;
      font-size: 85%;
      line-height: 1.45;
      margin: 16px 0;
    }

    pre code {
      background: transparent;
      padding: 0;
      font-size: 100%;
    }

    table {
      border-spacing: 0;
      border-collapse: collapse;
      margin: 16px 0;
      width: 100%;
      overflow: auto;
      display: block;
    }

    table th, table td {
      padding: 8px 13px;
      border: 1px solid var(--border-color);
    }

    table th {
      font-weight: 600;
      background-color: #161b22;
    }

    table tr:nth-child(2n) {
      background-color: rgba(22, 27, 34, 0.5);
    }

    /* Botão copiar código */
    .copy-code-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      background: #21262d;
      border: 1px solid var(--border-color);
      color: var(--text-muted);
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 11px;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s, background 0.2s;
    }

    pre:hover .copy-code-btn {
      opacity: 1;
    }

    .copy-code-btn:hover {
      background: #30363d;
      color: var(--text-main);
    }

    /* Scrollbar personalizada */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: var(--bg-canvas); }
    ::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #484f58; }
  </style>
</head>
<body>
  <header>
    <div class="header-left">
      <div class="brand-badge">MD DARK VIEWER</div>
      <div class="file-select-wrapper">
        <select id="fileSelector" title="Selecione o arquivo Markdown"></select>
      </div>
    </div>
    <div class="header-right">
      <div class="status-pill" id="syncStatus">
        <div class="status-dot" id="syncDot"></div>
        <span id="syncText">Ao vivo (F5 sincronizado)</span>
      </div>
      <button class="btn" id="btnCopyRaw" title="Copiar Markdown bruto">
        📋 Copiar
      </button>
      <button class="btn" id="btnReload" title="Recarregar agora (F5)">
        🔄 F5
      </button>
    </div>
  </header>

  <main class="container">
    <article id="content">Carregando documento...</article>
  </main>

  <script>
    let currentPath = '';
    let lastMtime = 0;
    let rawMarkdown = '';

    // Configura o Marked com Highlight.js
    marked.setOptions({
      highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      },
      breaks: true,
      gfm: true
    });

    // Trata alertas especiais [!NOTE], [!TIP], etc
    function transformAlerts(html) {
      return html
        .replace(/<blockquote>\s*<p>\[!NOTE\]<br>([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
          '<div class="alert-box alert-note"><div class="alert-title">ℹ️ Informação</div><p>$1</p></div>')
        .replace(/<blockquote>\s*<p>\[!TIP\]<br>([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
          '<div class="alert-box alert-tip"><div class="alert-title">💡 Dica</div><p>$1</p></div>')
        .replace(/<blockquote>\s*<p>\[!IMPORTANT\]<br>([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
          '<div class="alert-box alert-important"><div class="alert-title">📌 Importante</div><p>$1</p></div>')
        .replace(/<blockquote>\s*<p>\[!WARNING\]<br>([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
          '<div class="alert-box alert-warning"><div class="alert-title">⚠️ Aviso</div><p>$1</p></div>')
        .replace(/<blockquote>\s*<p>\[!CAUTION\]<br>([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
          '<div class="alert-box alert-caution"><div class="alert-title">🛑 Atenção</div><p>$1</p></div>');
    }

    // Adiciona botão de cópia aos blocos de código
    function attachCopyButtons() {
      document.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.copy-code-btn')) return;
        const btn = document.createElement('button');
        btn.className = 'copy-code-btn';
        btn.textContent = 'Copiar';
        btn.onclick = () => {
          const code = pre.querySelector('code')?.innerText || '';
          navigator.clipboard.writeText(code).then(() => {
            btn.textContent = 'Copiado!';
            setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
          });
        };
        pre.appendChild(btn);
      });
    }

    async function loadFileList() {
      const res = await fetch('/api/files');
      const files = await res.json();
      const selector = document.getElementById('fileSelector');
      selector.innerHTML = '';

      // Agrupa: Raiz, Rules, Skills Fixas, etc.
      files.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.relPath;
        opt.textContent = f.relPath;
        selector.appendChild(opt);
      });

      // Checa se veio arquivo por query string ou seleciona o primeiro
      const params = new URLSearchParams(window.location.search);
      const requested = params.get('file');

      if (requested && files.some(f => f.relPath === requested)) {
        selector.value = requested;
      } else if (files.some(f => f.relPath === 'todo.md')) {
        selector.value = 'todo.md';
      } else if (files.length > 0) {
        selector.value = files[0].relPath;
      }

      currentPath = selector.value;
      await renderCurrentFile();
    }

    async function renderCurrentFile() {
      if (!currentPath) return;
      try {
        const res = await fetch('/api/content?path=' + encodeURIComponent(currentPath));
        if (!res.ok) throw new Error('Arquivo não encontrado');
        const data = await res.json();
        rawMarkdown = data.content;
        lastMtime = data.mtime;

        const renderedHtml = transformAlerts(marked.parse(rawMarkdown));
        document.getElementById('content').innerHTML = renderedHtml;
        document.title = currentPath + ' | Dark Viewer';
        attachCopyButtons();
      } catch (err) {
        document.getElementById('content').innerHTML =
          '<p style="color:var(--danger)">Erro ao carregar ' + currentPath + ': ' + err.message + '</p>';
      }
    }

    // Polling sutil para verificar se o arquivo mudou no disco
    async function checkForUpdates() {
      if (!currentPath) return;
      try {
        const res = await fetch('/api/mtime?path=' + encodeURIComponent(currentPath));
        if (res.ok) {
          const { mtime } = await res.json();
          if (lastMtime && mtime > lastMtime) {
            // Arquivo foi alterado no disco! Atualiza mantendo a posição de scroll
            const scrollPos = document.querySelector('.container').scrollTop;
            await renderCurrentFile();
            document.querySelector('.container').scrollTop = scrollPos;

            // Pulso visual no indicador
            const dot = document.getElementById('syncDot');
            dot.style.background = 'var(--accent)';
            setTimeout(() => { dot.style.background = 'var(--success)'; }, 1000);
          }
        }
      } catch (e) {}
    }

    setInterval(checkForUpdates, 1000);

    // Eventos
    document.getElementById('fileSelector').addEventListener('change', (e) => {
      currentPath = e.target.value;
      const url = new URL(window.location);
      url.searchParams.set('file', currentPath);
      window.history.pushState({}, '', url);
      renderCurrentFile();
    });

    document.getElementById('btnReload').addEventListener('click', () => {
      renderCurrentFile();
    });

    document.getElementById('btnCopyRaw').addEventListener('click', () => {
      if (!rawMarkdown) return;
      navigator.clipboard.writeText(rawMarkdown).then(() => {
        const btn = document.getElementById('btnCopyRaw');
        btn.textContent = '✅ Copiado!';
        setTimeout(() => { btn.textContent = '📋 Copiar'; }, 2000);
      });
    });

    // Início
    loadFileList();
  </script>
</body>
</html>`;

// Servidor HTTP nativo sem dependências externas
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // Servir página inicial
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML_TEMPLATE);
    return;
  }

  // API para listar arquivos .md do workspace
  if (pathname === '/api/files') {
    const files = findMarkdownFiles(ROOT_DIR);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(files));
    return;
  }

  // API para ler conteúdo de um arquivo .md (lido diretamente do disco em tempo real!)
  if (pathname === '/api/content') {
    const reqPath = parsedUrl.searchParams.get('path');
    if (!reqPath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Parâmetro path ausente' }));
      return;
    }
    const fullPath = path.resolve(ROOT_DIR, reqPath);
    if (!fullPath.startsWith(ROOT_DIR) || !fs.existsSync(fullPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Arquivo não encontrado' }));
      return;
    }
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const stat = fs.statSync(fullPath);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ content, mtime: stat.mtimeMs }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API leve para verificar modificação (mtime)
  if (pathname === '/api/mtime') {
    const reqPath = parsedUrl.searchParams.get('path');
    const fullPath = path.resolve(ROOT_DIR, reqPath || '');
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ mtime: stat.mtimeMs }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  const initialFile = argFile
    ? path.relative(ROOT_DIR, argFile).replace(/\\/g, '/')
    : 'todo.md';
  const url = `http://localhost:${PORT}/?file=${encodeURIComponent(initialFile)}`;
  console.log(`\n======================================================`);
  console.log(`🚀 Markdown Dark Viewer ativo em: ${url}`);
  console.log(`   Pressione F5 no navegador ou altere no editor para ver ao vivo.`);
  console.log(`   Pressione CTRL+C para encerrar o visualizador.`);
  console.log(`======================================================\n`);

  // Abre automaticamente o navegador no Windows
  const openCmd = process.platform === 'win32' ? `start "${url}" "${url}"` : `xdg-open "${url}"`;
  exec(openCmd, () => {});
});
