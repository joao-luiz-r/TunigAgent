export function parseTabularResult(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return null;

  const isSeparator = (line) => /^[\s\-_=+|]+$/.test(line) && !/[a-z0-9]/i.test(line);
  const delimiter = detectDelimiter(lines[0]);
  if (!delimiter) return null;

  const columns = splitLine(lines[0], delimiter).map(sanitizeColumnName);
  const dedupedColumns = dedupeColumns(columns);
  if (dedupedColumns.length === 0) return null;

  let dataStart = 1;
  if (isSeparator(lines[1])) dataStart = 2;

  const rows = [];
  for (let i = dataStart; i < lines.length; i += 1) {
    const values = splitLine(lines[i], delimiter);
    const row = {};
    dedupedColumns.forEach((column, index) => {
      row[column] = values[index] ?? null;
    });
    rows.push(row);
  }
  if (rows.length === 0) return null;
  return { columns: dedupedColumns, rows };
}

function detectDelimiter(line) {
  if (line.includes('\t')) return { regex: /\t/ };
  if (line.includes('|')) return { regex: /\|/ };
  if (/\s{2,}/.test(line)) return { regex: /\s{2,}/ };
  return null;
}

function splitLine(line, delimiter) {
  if (delimiter.regex.toString() === '/\\s{2,}/') {
    return line
      .split(/\s{2,}/)
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return line.split(delimiter.regex).map((value) => value.trim());
}

function sanitizeColumnName(name) {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  return clean || 'coluna';
}

function dedupeColumns(columns) {
  const seen = new Map();
  return columns.map((column) => {
    const count = seen.get(column) || 0;
    seen.set(column, count + 1);
    return count === 0 ? column : `${column}_${count + 1}`;
  });
}
