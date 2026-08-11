import { HarnessState, SessionStatus } from '../../domain/enums/harness-state.js';
import { FACTORY_SKILL_NAME } from '../skill-factory/interview-steps.js';
import { AUTO_SKILL_NAME } from '../skills/skill-matcher.js';
import { buildHarnessSystemPrompt, isolateUserData } from './prompt-builder.js';
import { DataChangeDetector } from './data-change-detector.js';
import { SkillHandoffDetector } from './skill-handoff-detector.js';

const MAX_LOOP_ITERATIONS = 8;

export class Harness {
  constructor({ sessionManager, llm, contextManager, toolRegistry, skillRegistry, cacheManager, interviewController, skillGenerator, skillLoader, detector, skillMatcher }) {
    this.sessionManager = sessionManager;
    this.llm = llm;
    this.contextManager = contextManager;
    this.toolRegistry = toolRegistry;
    this.skillRegistry = skillRegistry;
    this.cacheManager = cacheManager;
    this.interviewController = interviewController;
    this.skillGenerator = skillGenerator;
    this.skillLoader = skillLoader;
    this.detector = detector;
    this.skillMatcher = skillMatcher;
    this.dataChangeDetector = new DataChangeDetector();
    this.handoffDetector = new SkillHandoffDetector();
  }

  async prepareFactorySession(session) {
    this.interviewController.start(session);
    session.state = HarnessState.WAITING_DATA;
    await this.interviewController.generateCurrentQuestion(session);
    this.sessionManager.save(session);
    return session;
  }

  async handleAct(sessionId, message) {
    const session = this.sessionManager.get(sessionId);
    if (!session) {
      throw new Error('Sessão não encontrada');
    }
    if (this.detector.isCreationRequest(message)) {
      const factorySession = this.sessionManager.create(FACTORY_SKILL_NAME);
      await this.prepareFactorySession(factorySession);
      return factorySession.toPublicState();
    }
    if (session.skillName === AUTO_SKILL_NAME) {
      const matched = this.skillMatcher.match(message);
      session.skillName = matched ? matched.name : 'general_tuning';
      this.sessionManager.save(session);
    }
    if (session.skillName === FACTORY_SKILL_NAME) {
      if (session.interview && !session.interview.complete) {
        return this.answerInterview(session, message);
      }
      session.history.push({ role: 'user', content: message });
      const reply = 'A entrevista da Skill Factory foi concluída. Inicie uma nova sessão para usar a skill criada ou criar outra.';
      session.history.push({ role: 'assistant', content: reply });
      session.finalSuggestion = reply;
      this.sessionManager.save(session);
      return session.toPublicState();
    }
    session.history.push({ role: 'user', content: message });
    session.state = HarnessState.THINKING;
    session.finalSuggestion = null;
    if (this.dataChangeDetector.detect(message)) {
      await this.cacheManager.invalidateFacts(session.sessionId);
    }
    this.sessionManager.save(session);
    await this.runDiagnosticLoop(session);
    this.applySkillFactoryHint(session, message);
    this.sessionManager.save(session);
    return session.toPublicState();
  }

  async handleFeedback(sessionId, userResult) {
    const session = this.sessionManager.get(sessionId);
    if (!session) {
      throw new Error('Sessão não encontrada');
    }
    if (session.interview && !session.interview.complete) {
      return this.answerInterview(session, userResult);
    }
    if (session.pendingTool) {
      return this.handleToolResult(session, userResult);
    }
    throw new Error('Não há solicitação pendente na sessão');
  }

  async answerInterview(session, answer) {
    this.interviewController.recordAnswer(session, answer);
    session.history.push({ role: 'user', content: answer });
    if (this.interviewController.isLastStep(session)) {
      session.state = HarnessState.DELIBERATING;
      this.sessionManager.save(session);
      const skill = await this.skillGenerator.generate(session.interview.answers);
      await this.skillLoader.registerDynamic(skill);
      session.state = HarnessState.COMPLETED;
      session.status = SessionStatus.COMPLETED;
      session.interview.complete = true;
      session.finalSuggestion = `Skill "${skill.name}" criada com sucesso e registrada na biblioteca. Inicie uma nova conversa e escolha essa skill para usá-la nos próximos diagnósticos.`;
      this.sessionManager.save(session);
      return session.toPublicState();
    }
    this.interviewController.advance(session);
    session.state = HarnessState.WAITING_DATA;
    await this.interviewController.generateCurrentQuestion(session);
    this.sessionManager.save(session);
    return session.toPublicState();
  }

  async handleToolResult(session, userResult) {
    const pending = session.pendingTool;
    const tool = this.toolRegistry.get(pending.toolName);
    session.state = HarnessState.VALIDATING;
    this.sessionManager.save(session);
    let parsed;
    try {
      parsed = tool.parseResult(userResult);
    } catch {
      session.history.push({
        role: 'assistant',
        content:
          'Não consegui interpretar o resultado enviado. Certifique-se de colar a saída completa do script no SSMS e tente novamente.',
      });
      session.state = HarnessState.WAITING_DATA;
      this.sessionManager.save(session);
      return session.toPublicState();
    }
    await this.cacheManager.storeFact(session.sessionId, tool.name, pending.paramsHash, parsed);
    session.history.push({ role: 'tool', tool_call_id: pending.toolCallId, content: JSON.stringify(parsed) });
    session.pendingTool = null;
    session.state = HarnessState.DELIBERATING;
    this.sessionManager.save(session);
    await this.runDiagnosticLoop(session);
    const lastUserMessage = this.lastUserMessage(session);
    if (lastUserMessage) this.applySkillFactoryHint(session, lastUserMessage);
    this.sessionManager.save(session);
    return session.toPublicState();
  }

  applySkillFactoryHint(session, message) {
    if (session.state !== HarnessState.COMPLETED || !this.detector.detect(message)) return;
    session.finalSuggestion +=
      '\n\n💡 Detectei que você aplicou uma correção manual. Quer transformá-la em uma skill reutilizável? Diga "quero criar uma skill".';
    const last = session.history[session.history.length - 1];
    if (last && last.role === 'assistant') last.content = session.finalSuggestion;
  }

  lastUserMessage(session) {
    for (let i = session.history.length - 1; i >= 0; i -= 1) {
      const entry = session.history[i];
      if (entry.role === 'user') return entry.content;
    }
    return null;
  }

  async runDiagnosticLoop(session) {
    let skill = this.skillRegistry.get(session.skillName);
    for (let iteration = 0; iteration < MAX_LOOP_ITERATIONS; iteration += 1) {
      const messages = this.contextManager.trim(session.history);
      const tools = this.toolRegistry.definitions(skill.toolsRequired);
      const response = await this.llm.createChatCompletion({
        system: buildHarnessSystemPrompt({ skill, skillRegistry: this.skillRegistry }),
        messages: isolateUserData(messages),
        tools,
      });
      const toolCalls = response.tool_calls && response.tool_calls.length > 0 ? response.tool_calls : null;
      if (!toolCalls) {
        const handoffName = this.handoffDetector.detect(response.content);
        if (handoffName && this.skillRegistry.get(handoffName) && handoffName !== skill.name) {
          const cleanContent = this.handoffDetector.strip(response.content);
          session.history.push({ role: 'assistant', content: cleanContent });
          session.skillName = handoffName;
          skill = this.skillRegistry.get(handoffName);
          continue;
        }
        session.finalSuggestion = response.content || 'Análise concluída.';
        session.state = HarnessState.COMPLETED;
        session.status = SessionStatus.COMPLETED;
        session.history.push({ role: 'assistant', content: session.finalSuggestion });
        return;
      }
      const call = toolCalls[0];
      const tool = this.toolRegistry.get(call.function.name);
      if (!tool) {
        session.history.push({ role: 'assistant', content: null, tool_calls: [call] });
        session.history.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error: `Ferramenta desconhecida: ${call.function.name}` }),
        });
        continue;
      }
      const params = safeParseArgs(call.function.arguments);
      const paramsHash = tool.computeKey(params);
      const cached = await this.cacheManager.resolveFact(session.sessionId, tool.name, paramsHash);
      session.history.push({ role: 'assistant', content: null, tool_calls: [call] });
      if (cached) {
        session.history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(cached) });
        continue;
      }
      session.pendingTool = {
        toolName: tool.name,
        params,
        paramsHash,
        toolCallId: call.id,
        script: tool.buildScript(params),
        createdAt: Date.now(),
      };
      session.state = HarnessState.WAITING_DATA;
      return;
    }
    session.finalSuggestion =
      'A análise excedeu o número máximo de iterações. Ajuste o problema ou reinicie a conversa.';
    session.state = HarnessState.COMPLETED;
    session.status = SessionStatus.COMPLETED;
    session.history.push({ role: 'assistant', content: session.finalSuggestion });
  }
}

function safeParseArgs(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}
