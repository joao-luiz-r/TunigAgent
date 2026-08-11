const HANDOFF_PATTERN = /\[SKILL_HANDOFF:\s*([a-z0-9_]+)\s*\]/gi;

export class SkillHandoffDetector {
  detect(text) {
    const match = HANDOFF_PATTERN.exec(String(text || ''));
    if (!match) return null;
    HANDOFF_PATTERN.lastIndex = 0;
    return match[1].toLowerCase();
  }

  strip(text) {
    return String(text || '').replace(HANDOFF_PATTERN, '').trim();
  }
}
