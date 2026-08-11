import React, { useEffect } from 'react';
import { useApp } from './store/AppContext.jsx';
import { MessageList } from './components/MessageList.jsx';
import { ChatInput } from './components/ChatInput.jsx';
import { ToolRequestPanel } from './components/ToolRequestPanel.jsx';
import { InterviewPanel } from './components/InterviewPanel.jsx';

export function App() {
  const { state, startSession, sendMessage, submitResult, changeSkill, resetSession } = useApp();

  useEffect(() => {
    if (!state.sessionId && !state.busy) {
      startSession('auto');
    }
  }, [state.sessionId, state.busy, startSession]);

  if (!state.sessionId && !state.busy) {
    return (
      <div className="layout">
        <div className="setup">
          <h1>Agente de Tuning SQL Server</h1>
          <p>Iniciando sessão...</p>
        </div>
      </div>
    );
  }

  const waitingForData = Boolean(state.pendingTool);
  const waitingForAnswer = Boolean(state.interview);
  const inputDisabled = state.busy || waitingForData || waitingForAnswer;

  const handlePanelSubmit = (value) => {
    submitResult(value);
  };

  return (
    <div className="layout">
      <header className="app-header">
        <span className="app-title">Agente de Tuning — {state.skillName}</span>
        <label className="skill-select-label">
          Skill:
          <select
            className="skill-select"
            value={state.skillName}
            onChange={(event) => changeSkill(event.target.value)}
            disabled={state.busy || waitingForData || waitingForAnswer}
          >
            <option value="auto">auto (detectar pela análise)</option>
            {state.skills
              .filter((skill) => skill.name !== 'skill_factory')
              .map((skill) => (
                <option key={skill.name} value={skill.name}>
                  {skill.name}
                </option>
              ))}
            <option value="skill_factory">skill_factory (criar nova skill)</option>
          </select>
        </label>
        <button className="btn ghost small" onClick={resetSession}>
          Nova sessão
        </button>
      </header>
      {state.error && <div className="error-banner">{state.error}</div>}
      <main className="conversation">
        <MessageList messages={state.messages} finalSuggestion={state.finalSuggestion} busy={state.busy} />
        {waitingForData && <ToolRequestPanel pendingTool={state.pendingTool} onSubmit={handlePanelSubmit} />}
        {waitingForAnswer && <InterviewPanel interview={state.interview} onSubmit={handlePanelSubmit} />}
      </main>
      {!waitingForData && !waitingForAnswer && (
        <footer className="app-footer">
          <ChatInput onSubmit={sendMessage} disabled={inputDisabled} />
        </footer>
      )}
    </div>
  );
}
