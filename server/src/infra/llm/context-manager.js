export class ContextManager {
  constructor({ maxTokens }) {
    this.maxTokens = maxTokens;
  }

  countTokens(messages) {
    return messages.reduce((total, message) => {
      let size = 0;
      if (typeof message.content === 'string') size += message.content.length;
      if (message.role) size += message.role.length;
      if (message.tool_calls) size += JSON.stringify(message.tool_calls).length;
      return total + Math.ceil(size / 4);
    }, 0);
  }

  trim(messages) {
    const work = [...messages];
    const firstUserMessage = work.find((message) => message.role === 'user');
    while (work.length > 2 && this.countTokens(work) > this.maxTokens) {
      const protectedIndex = firstUserMessage ? work.indexOf(firstUserMessage) : -1;
      const index = protectedIndex === 0 ? 1 : 0;
      if (index >= work.length) break;
      const [removed] = work.splice(index, 1);
      if (removed && removed.role === 'assistant' && removed.tool_calls) {
        let cursor = index;
        while (cursor < work.length && work[cursor].role === 'tool') work.splice(cursor, 1);
      }
    }
    return work;
  }
}
