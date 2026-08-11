import React, { useState } from 'react';

export function InterviewPanel({ interview, onSubmit }) {
  const [answer, setAnswer] = useState('');

  const submit = () => {
    if (answer.trim()) onSubmit(answer);
  };

  return (
    <div className="panel interview-panel">
      <div className="panel-header">
        <span className="panel-title">Skill Factory — Entrevista guiada</span>
        <span className="step-indicator">
          Etapa {interview.stepIndex} de {interview.totalSteps}
        </span>
      </div>
      <div className="interview-question">{interview.question.text}</div>
      {interview.question.optional && <div className="optional-hint">(opcional)</div>}
      <textarea
        className="result-input"
        placeholder="Digite sua resposta..."
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        rows={3}
      />
      <button className="btn primary" onClick={submit} disabled={!answer.trim()}>
        {interview.stepIndex === interview.totalSteps ? 'Finalizar' : 'Próximo'}
      </button>
    </div>
  );
}
