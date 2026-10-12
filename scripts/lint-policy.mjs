// Locations are for reporting only. Counts prevent duplicate errors or a fixed
// error from concealing a different new error with the same overall total.
export function diagnosticKey(diagnostic) {
  return JSON.stringify([diagnostic.ruleId, diagnostic.message, diagnostic.source]);
}

export function newDiagnostics(current, previous) {
  const remaining = new Map();
  for (const diagnostic of previous) {
    const key = diagnosticKey(diagnostic);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  return current.filter(diagnostic => {
    const key = diagnosticKey(diagnostic);
    const count = remaining.get(key) ?? 0;
    if (!count) return true;
    remaining.set(key, count - 1);
    return false;
  });
}

export function parseChanges(output) {
  const fields = output.split('\0');
  if (fields.pop() !== '') throw new Error('Unterminated git name-status output.');
  const changes = [];
  for (let i = 0; i < fields.length;) {
    const status = fields[i++];
    if (!/^(?:[AMDT]|R\d+)$/.test(status)) throw new Error(`Unsupported git status: ${status}`);
    const before = fields[i++];
    const file = status.startsWith('R') ? fields[i++] : before;
    if (!before || !file) throw new Error('Incomplete git name-status output.');
    changes.push({ status: status[0], file, previousFile: status === 'A' ? null : before });
  }
  return changes;
}

// Dist and dependency directories already escape `pnpm lint`. Everything else
// with a JS/TS extension must receive a configuration, including Deno sources.
export function lintable(file) {
  return /\.(?:[cm]?[jt]sx?)$/i.test(file);
}

export function excluded(file) {
  return file.startsWith('dist/') || file.split('/').some(part => ['node_modules', '.git'].includes(part));
}

export function normalizeMessages(messages, source) {
  const lines = source.split('\n');
  const offset = (line, column) => lines.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0) + column - 1;
  return messages.map(message => ({
    ...message,
    source: (message.endLine && message.endColumn
      ? source.slice(offset(message.line, message.column), offset(message.endLine, message.endColumn))
      : (lines[message.line - 1] ?? '')).replace(/\s+/g, ' ').trim(),
  }));
}
