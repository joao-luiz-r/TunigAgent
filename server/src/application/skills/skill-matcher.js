export const AUTO_SKILL_NAME = 'auto';

const TOKEN_REGEX = /[a-z0-9*#@_]+/g;

export function normalizeMessage(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function tokenize(text) {
  return normalizeMessage(text).match(TOKEN_REGEX) || [];
}

export function buildSkillSignatures(skills) {
  const candidates = skills.filter(
    (skill) => skill.enabled && !skill.isFactory && skill.name !== 'general_tuning',
  );

  const signatures = [];
  for (const skill of candidates) {
    const terms = (skill.keywords || [])
      .map((keyword) => tokenize(keyword))
      .filter((tokens) => tokens.length > 0)
      .map((tokens) => ({ tokens, weight: tokens.length }));
    signatures.push({ name: skill.name, terms: terms.slice(0, 60) });
  }
  return signatures;
}

function hasSubsequence(tokens, subsequence) {
  for (let i = 0; i + subsequence.length <= tokens.length; i += 1) {
    let matches = true;
    for (let j = 0; j < subsequence.length; j += 1) {
      if (tokens[i + j] !== subsequence[j]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

function scoreMessage(tokens, terms) {
  let score = 0;
  let matchedPhrase = false;
  for (const { tokens: term, weight } of terms) {
    if (hasSubsequence(tokens, term)) {
      score += weight;
      if (term.length >= 2) matchedPhrase = true;
    }
  }
  return { score, matchedPhrase };
}

const MIN_SCORE = 2.0;

export class SkillMatcher {
  constructor({ skillRegistry }) {
    this.skillRegistry = skillRegistry;
    this._signatures = null;
    this._signatureVersion = -1;
  }

  getSignatures() {
    const skills = this.skillRegistry.all();
    const version = skills.length;
    if (!this._signatures || this._signatureVersion !== version) {
      this._signatures = buildSkillSignatures(skills);
      this._signatureVersion = version;
    }
    return this._signatures;
  }

  match(message) {
    const tokens = tokenize(message);
    if (tokens.length === 0) return null;

    const signatures = this.getSignatures();
    let bestName = null;
    let bestScore = 0;
    let bestHasPhrase = false;

    for (const signature of signatures) {
      const { score, matchedPhrase } = scoreMessage(tokens, signature.terms);
      if (score > bestScore || (score === bestScore && matchedPhrase && !bestHasPhrase)) {
        bestScore = score;
        bestHasPhrase = matchedPhrase;
        bestName = signature.name;
      }
    }

    if (bestName === null || bestScore < MIN_SCORE || !bestHasPhrase) return null;
    return this.skillRegistry.get(bestName);
  }

  normalize(message) {
    return normalizeMessage(message);
  }
}