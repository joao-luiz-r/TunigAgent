export class FrontmatterParseError extends Error {}

export function splitFrontmatter(source) {
  const lines = source.split(/\r?\n/);
  if (!lines[0] || lines[0].trim() !== '---') {
    return { attributes: {}, body: source };
  }
  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) {
    throw new FrontmatterParseError('Frontmatter sem delimitador final "---"');
  }
  const { value } = parseLevel(lines.slice(1, endIndex), 0, 0);
  const body = lines.slice(endIndex + 1).join('\n').trim();
  return { attributes: value || {}, body };
}

function parseLevel(lines, startIndex, levelIndent) {
  const value = {};
  let i = startIndex;

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.replace(/\t/g, '  ').replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) {
      i += 1;
      continue;
    }
    const indent = line.search(/\S/);
    if (indent < levelIndent) break;
    if (indent > levelIndent) throw new FrontmatterParseError(`Indentação inesperada: "${line}"`);

    const content = line.slice(indent);
    if (content.startsWith('- ')) {
      const nested = parseList(lines, i, indent);
      const listKey = Object.keys(value).pop();
      if (listKey === undefined) throw new FrontmatterParseError(`Item de lista sem chave: "${line}"`);
      value[listKey] = nested.value;
      i = nested.nextIndex;
      continue;
    }

    const match = content.match(/^([^:#]+):(?:\s*(.*))?$/);
    if (!match) throw new FrontmatterParseError(`Linha YAML inválida: "${line}"`);

    const key = match[1].trim();
    const rawValue = (match[2] || '').trim();

    const blockMatch = /^([|>])([+-]?)$/.exec(rawValue);
    if (blockMatch) {
      const block = consumeBlock(lines, i + 1, indent, blockMatch[1], blockMatch[2]);
      value[key] = block.value;
      i = block.nextIndex;
      continue;
    }

    if (rawValue === '') {
      const next = nextNonBlank(lines, i + 1);
      if (next && next.indent > indent) {
        if (next.content.startsWith('- ')) {
          const list = parseList(lines, i + 1, next.indent);
          value[key] = list.value;
          i = list.nextIndex;
        } else {
          const nested = parseLevel(lines, i + 1, next.indent);
          value[key] = nested.value;
          i = nested.nextIndex;
        }
      } else {
        value[key] = {};
        i += 1;
      }
      continue;
    }

    value[key] = parseScalar(rawValue);
    i += 1;
  }

  return { value, nextIndex: i };
}

function parseList(lines, startIndex, listIndent) {
  const list = [];
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i].replace(/\t/g, '  ').replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) {
      i += 1;
      continue;
    }
    const indent = line.search(/\S/);
    if (indent < listIndent) break;
    if (indent > listIndent) {
      i += 1;
      continue;
    }
    const content = line.slice(indent);
    if (!content.startsWith('- ')) break;
    const itemText = content.slice(2).trim();
    if (itemText === '') {
      const next = nextNonBlank(lines, i + 1);
      if (next && next.indent > listIndent && !next.content.startsWith('- ')) {
        const nested = parseLevel(lines, i + 1, next.indent);
        list.push(nested.value);
        i = nested.nextIndex;
        continue;
      }
      list.push(null);
      i += 1;
      continue;
    }
    list.push(parseScalar(itemText));
    i += 1;
  }
  return { value: list, nextIndex: i };
}

function consumeBlock(lines, index, parentIndent, style, chomp) {
  const collected = [];
  let i = index;
  const blockIndent = parentIndent + 2;
  while (i < lines.length) {
    const l = lines[i].replace(/\t/g, '  ');
    if (!l.trim()) {
      collected.push('');
      i += 1;
      continue;
    }
    const ind = l.search(/\S/);
    if (ind < blockIndent) break;
    collected.push(l.slice(blockIndent));
    i += 1;
  }
  let result = collected.join(style === '>' ? ' ' : '\n');
  if (chomp === '-') result = result.replace(/\s+$/, '');
  else if (chomp === '+') result += '\n';
  else result = result.replace(/\s+$/, '');
  return { value: result, nextIndex: i };
}

function nextNonBlank(lines, index) {
  for (let i = index; i < lines.length; i += 1) {
    const line = lines[i].replace(/\t/g, '  ');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    return { indent: line.search(/\S/), content: line.slice(line.search(/\S/)) };
  }
  return null;
}

export function parseScalar(value) {
  if (value === 'null' || value === '~') return null;
  if (value === 'true' || value === 'false') return value === 'true';
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((part) => parseScalar(part.trim()))
      .filter((part) => part !== '');
  }
  return value;
}
