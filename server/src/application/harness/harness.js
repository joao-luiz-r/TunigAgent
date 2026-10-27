import { HarnessState, SessionStatus } from '../../domain/enums/harness-state.js';
import { FACTORY_SKILL_NAME } from '../skill-factory/interview-steps.js';
import { AUTO_SKILL_NAME } from '../skills/skill-matcher.js';
import { analyzeSql } from '../analyzers/sql-analyzer.js';
import { buildFullSkillDetails } from '../skills/skill-catalog.js';
import { buildHarnessSystemPrompt, isolateUserData } from './prompt-builder.js';
import { SKILL_DETAILS_TOOL_NAME, normalizeNames } from '../tools/get-skill-details.tool.js';
import { DataChangeDetector } from './data-change-detector.js';
import { SkillHandoffDetector } from './skill-handoff-detector.js';

const MAX_LOOP_ITERATIONS = 8;
const MAX_CANDIDATE_SKILLS = 3;
const BASE_COLLECT_TOOLS = ['get_execution_plan', 'get_query_text'];

// Mapeamento conservador: título do finding do analyzeSql -> skill.
// Só entra se a skill existir no registry.
const ANALYZER_SKILL_MAP = [
  { match: 'SELECT *', skill: 'avoid_select_star' },
  { match: 'curinga inicial', skill: 'avoid_wildcard_prefix' },
  { match: 'Função aplicada', skill: 'avoid_non_sargable_predicate' },
  { match: 'Aritmética sobre', skill: 'avoid_non_sargable_predicate' },
  { match: 'TOP sem ORDER BY', skill: 'always_use_order_by_for_guaranteed_order' },
];

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
      // O SQL que motivou a skill viaja junto (o ANTES real, não inferido).
      factorySession.interview.originSql = this.extractOriginalCode(session);
      this.sessionManager.save(factorySession);
      return factorySession.toPublicState();
    }
    if (session.skillName === AUTO_SKILL_NAME) {
      const matched = this.skillMatcher.match(message);
      // skillName segue como dica de rota (compat); o conjunto real de
      // skills usadas vai para session.loadedSkills (pode combinar várias).
      session.skillName = matched ? matched.name : 'general_tuning';
      this.ensureLoadedSkills(session, this.selectCandidateSkills(message, matched));
      this.sessionManager.save(session);
    } else if (session.loadedSkills.length === 0) {
      this.ensureLoadedSkills(session, [session.skillName, ...this.analyzerExtraSkills(message)]);
      this.sessionManager.save(session);
    } else {
      // Turnos seguintes: acumula novas skills detectadas, nunca troca.
      const extras = this.analyzerExtraSkills(message).filter((name) => !session.loadedSkills.includes(name));
      if (extras.length > 0) {
        this.ensureLoadedSkills(session, extras);
        this.sessionManager.save(session);
      }
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
      const skill = await this.skillGenerator.generate(session.interview.answers, {
        beforeScript: session.interview && session.interview.originSql,
      });
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

  extractOriginalCode(session) {
    const sqlLike = /\b(select|with|update|delete|merge)\b/i;
    const entry = (session.history || []).find(
      (message) => message.role === 'user' && typeof message.content === 'string' && sqlLike.test(message.content),
    );
    if (!entry) return '';
    return entry.content.trim().slice(0, 4000);
  }

  selectCandidateSkills(message, matched) {
    const names = [];
    if (matched) names.push(matched.name);
    for (const extra of this.analyzerExtraSkills(message)) {
      if (!names.includes(extra)) names.push(extra);
    }
    if (names.length === 0) names.push('general_tuning');
    return names.slice(0, MAX_CANDIDATE_SKILLS);
  }

  analyzerExtraSkills(message) {
    let findings = [];
    try {
      findings = analyzeSql(message);
    } catch {
      return [];
    }
    const extras = [];
    for (const finding of findings) {
      const title = finding && finding.title ? String(finding.title) : '';
      for (const { match, skill } of ANALYZER_SKILL_MAP) {
        if (title.includes(match) && !extras.includes(skill) && this.skillRegistry.get(skill)) {
          extras.push(skill);
        }
      }
    }
    return extras;
  }

  ensureLoadedSkills(session, names) {
    if (!Array.isArray(session.loadedSkills)) session.loadedSkills = [];
    for (const name of names || []) {
      if (!name || session.loadedSkills.includes(name)) continue;
      const skill = this.skillRegistry.get(name);
      if (!skill || skill.isFactory) continue;
      session.loadedSkills.push(name);
    }
    return session.loadedSkills;
  }

  loadedSkillObjects(session) {
    return (session.loadedSkills || [])
      .map((name) => this.skillRegistry.get(name))
      .filter((skill) => skill && !skill.isFactory);
  }

  unionToolDefinitions(session) {
    const names = [];
    for (const skill of this.loadedSkillObjects(session)) {
      for (const toolName of skill.toolsRequired || []) {
        if (!names.includes(toolName)) names.push(toolName);
      }
    }
    for (const base of BASE_COLLECT_TOOLS) {
      if (!names.includes(base)) names.push(base);
    }
    const definitions = this.toolRegistry.definitions(names);
    const details = this.toolRegistry.get(SKILL_DETAILS_TOOL_NAME);
    if (details) definitions.push(details.getDefinition());
    return definitions;
  }

  async resolveSkillDetailsCall(session, call) {
    const args = safeParseArgs(call.function.arguments);
    const requested = normalizeNames(args);
    const tool = this.toolRegistry.get(SKILL_DETAILS_TOOL_NAME);
    const resolved = tool ? tool.resolve(requested) : [];
    const resolvedNames = resolved.map((skill) => skill.name);
    const unknown = requested.filter((name) => !resolvedNames.includes(name));
    this.ensureLoadedSkills(session, resolvedNames);
    session.history.push({ role: 'assistant', content: null, tool_calls: [call] });
    session.history.push({
      role: 'tool',
      tool_call_id: call.id,
      content: JSON.stringify({
        skills: resolved.map((skill) => ({ name: skill.name, details: buildFullSkillDetails(skill) })),
        unknown,
      }),
    });
    this.sessionManager.save(session);
  }

  async runDiagnosticLoop(session) {
    if (session.loadedSkills.length === 0) {
      this.ensureLoadedSkills(session, [session.skillName, 'general_tuning']);
      this.sessionManager.save(session);
    }
    for (let iteration = 0; iteration < MAX_LOOP_ITERATIONS; iteration += 1) {
      const messages = this.contextManager.trim(session.history);
      const tools = this.unionToolDefinitions(session);
      const loaded = this.loadedSkillObjects(session);
      const response = await this.llm.createChatCompletion({
        system: buildHarnessSystemPrompt({
          skillRegistry: this.skillRegistry,
          loadedSkills: loaded,
          routeHint: session.skillName,
        }),
        messages: isolateUserData(messages),
        tools,
      });
      const toolCalls = response.tool_calls && response.tool_calls.length > 0 ? response.tool_calls : null;
      if (!toolCalls) {
        // Handoff agora ACUMULA a skill (multi-skill); skillName segue como
        // dica de rota (compat com API/testes).
        const handoffName = this.handoffDetector.detect(response.content);
        const handoffSkill = handoffName ? this.skillRegistry.get(handoffName) : null;
        if (handoffSkill && !handoffSkill.isFactory && !session.loadedSkills.includes(handoffName)) {
          const cleanContent = this.handoffDetector.strip(response.content);
          session.history.push({ role: 'assistant', content: cleanContent });
          this.ensureLoadedSkills(session, [handoffName]);
          session.skillName = handoffName;
          this.sessionManager.save(session);
          continue;
        }
        session.finalSuggestion = response.content || 'Análise concluída.';
        session.state = HarnessState.COMPLETED;
        session.status = SessionStatus.COMPLETED;
        session.history.push({ role: 'assistant', content: session.finalSuggestion });
        return;
      }
      const call = toolCalls[0];
      if (call.function.name === SKILL_DETAILS_TOOL_NAME) {
        await this.resolveSkillDetailsCall(session, call);
        continue;
      }
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
