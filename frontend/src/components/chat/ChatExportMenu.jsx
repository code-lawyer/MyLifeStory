import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore.js';

function formatBlock(block) {
  const header = `=== ${block.characterName} ===\n`;
  const body = block.messages.map(m =>
    m.role === 'user' ? `[你] ${m.content}` : `[${block.characterName}] ${m.content}`
  ).join('\n\n');
  return header + body;
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ChatExportMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const blocks = useChatStore((s) => s.blocks);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (blocks.length === 0) return null;

  const uniqueChars = [...new Map(blocks.map(b => [b.characterId, b.characterName])).entries()];

  function exportAll() {
    const text = blocks.map(formatBlock).join('\n\n---\n\n');
    downloadText('对话记录.txt', text);
    setOpen(false);
  }

  function exportByCharacter(charId, charName) {
    const charBlocks = blocks.filter(b => b.characterId === charId);
    const text = charBlocks.map(formatBlock).join('\n\n---\n\n');
    downloadText(`对话记录-${charName}.txt`, text);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-ink/30 hover:text-ink/60 transition-colors"
      >
        导出对话
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-1 bg-white border border-ink/10 rounded-lg shadow-lg py-1 min-w-[120px] z-50">
          <button onClick={exportAll} className="w-full text-left px-3 py-1.5 text-xs text-ink/70 hover:bg-ink/5">
            导出全部
          </button>
          {uniqueChars.length > 1 && (
            <>
              <div className="border-t border-ink/8 my-1" />
              {uniqueChars.map(([charId, charName]) => (
                <button
                  key={charId}
                  onClick={() => exportByCharacter(charId, charName)}
                  className="w-full text-left px-3 py-1.5 text-xs text-ink/70 hover:bg-ink/5"
                >
                  {charName}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
