import React, { useState } from 'react';

export function ChatInput({ onSubmit, disabled }) {
  const [text, setText] = useState('');

  const submit = () => {
    if (text.trim()) {
      onSubmit(text);
      setText('');
    }
  };

  return (
    <div className="chat-input">
      <textarea
        placeholder="Descreva o problema ou envie um comando (ex: quero criar uma skill)..."
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        rows={5}
        disabled={disabled}
      />
      <button className="btn primary" onClick={submit} disabled={disabled || !text.trim()}>
        Enviar
      </button>
    </div>
  );
}
