import React from 'react';
import ReactMarkdown from 'react-markdown';

export function MessageList({ messages, finalSuggestion, busy }) {
  const lastIsFinal = messages.length > 0 && messages[messages.length - 1].content === finalSuggestion;
  return (
    <div className="message-list">
      {messages.map((message, index) => (
        <div key={`${message.role}-${index}`} className={`bubble bubble-${message.role}`}>
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      ))}
      {finalSuggestion && !lastIsFinal && (
        <div className="bubble bubble-assistant suggestion">
          <ReactMarkdown>{finalSuggestion}</ReactMarkdown>
        </div>
      )}
      {busy && (
        <div className="bubble bubble-assistant busy">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      )}
    </div>
  );
}
