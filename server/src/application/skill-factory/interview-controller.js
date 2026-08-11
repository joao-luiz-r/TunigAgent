import { INTERVIEW_STEPS } from './interview-steps.js';
import { AGENT_PERSONA } from '../agent/persona.js';
import { buildInterviewSystemPrompt } from './prompt-loader.js';

export class InterviewController {
  constructor({ llm }) {
    this.llm = llm;
  }

  start(session) {
    session.interview = {
      steps: INTERVIEW_STEPS,
      currentIndex: 0,
      answers: {},
      question: null,
      complete: false,
    };
  }

  currentStep(session) {
    return session.interview.steps[session.interview.currentIndex];
  }

  isLastStep(session) {
    return session.interview.currentIndex === session.interview.steps.length - 1;
  }

  advance(session) {
    session.interview.currentIndex += 1;
    if (session.interview.currentIndex >= session.interview.steps.length) {
      session.interview.complete = true;
    }
  }

  recordAnswer(session, answer) {
    const step = session.interview.steps[session.interview.currentIndex];
    if (!step) return;
    session.interview.answers[step.key] = answer;
  }

  async generateCurrentQuestion(session) {
    const step = this.currentStep(session);
    const stepNumber = session.interview.currentIndex + 1;
    const previousAnswers = session.interview.answers;
    let text = step.topic;
    try {
      const system = [
        AGENT_PERSONA,
        'SKILL_FACTORY_INTERVIEW.',
        buildInterviewSystemPrompt({
          stepNumber,
          totalSteps: session.interview.steps.length,
          topic: step.topic,
          context: previousAnswers,
        }),
      ].join('\n\n');
      const message = await this.llm.createChatCompletion({ system, messages: [] });
      if (message.content && message.content.trim()) text = message.content.trim();
    } catch {
      text = step.topic;
    }
    session.interview.question = {
      step: step.key,
      stepNumber,
      totalSteps: session.interview.steps.length,
      optional: step.optional,
      text,
    };
    return session.interview.question;
  }
}
