import { randomUUID } from 'node:crypto';
import { HarnessState, SessionStatus } from '../enums/harness-state.js';

export class Session {
  constructor({ sessionId, skillName }) {
    this.sessionId = sessionId || randomUUID();
    this.skillName = skillName;
    this.status = SessionStatus.ACTIVE;
    this.state = HarnessState.IDLE;
    this.history = [];
    this.facts = new Map();
    this.pendingTool = null;
    this.interview = null;
    this.finalSuggestion = null;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  touch() {
    this.updatedAt = Date.now();
  }

  toPublicState() {
    const finalSuggestionContent = this.finalSuggestion;
    const messages = this.history
      .filter((entry) => entry.role === 'user' || (entry.role === 'assistant' && entry.content != null))
      .map((entry) => ({ role: entry.role, content: entry.content }))
      .filter(
        (message) =>
          !(message.role === 'assistant' && finalSuggestionContent && message.content === finalSuggestionContent),
      );
    const pendingTool = this.pendingTool
      ? {
          toolName: this.pendingTool.toolName,
          script: this.pendingTool.script,
          note: 'Execute o script no SSMS (SQL Server Management Studio) e cole o resultado abaixo.',
        }
      : null;
    const interview =
      this.interview && !this.interview.complete
        ? {
            stepIndex: this.interview.currentIndex + 1,
            totalSteps: this.interview.steps.length,
            question: this.interview.question,
            answers: this.interview.answers,
          }
        : null;
    return {
      sessionId: this.sessionId,
      skillName: this.skillName,
      status: this.status,
      state: this.state,
      messages,
      pendingTool,
      interview,
      finalSuggestion: this.finalSuggestion,
      updatedAt: this.updatedAt,
    };
  }
}
