import React, { useState } from 'react';

export function ToolRequestPanel({ pendingTool, onSubmit }) {
  const [result, setResult] = useState('');
  const [copied, setCopied] = useState(false);

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(pendingTool.script);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const submit = () => {
    if (result.trim()) onSubmit(result);
  };

  return (
    <div className="panel tool-panel">
      <div className="panel-header">
        <span className="panel-title">Ferramenta de coleta: {pendingTool.toolName}</span>
      </div>
      <p>{pendingTool.note}</p>
      <pre className="sql-script">{pendingTool.script}</pre>
      <button className="btn ghost" onClick={copyScript}>
        {copied ? 'Copiado!' : 'Copiar script'}
      </button>
      <textarea
        className="result-input"
        placeholder="Cole aqui o resultado do script..."
        value={result}
        onChange={(event) => setResult(event.target.value)}
        rows={8}
      />
      <button className="btn primary" onClick={submit} disabled={!result.trim()}>
        Enviar resultado
      </button>
    </div>
  );
}
