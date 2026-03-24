export function formatBlock(block) {
  const header = `=== ${block.characterName} ===\n`;
  const body = block.messages.map(m =>
    m.role === 'user' ? `[你] ${m.content}` : `[${block.characterName}] ${m.content}`
  ).join('\n\n');
  return header + body;
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
