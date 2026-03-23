import { useState, useRef, useEffect } from 'react';
import { buildContext, streamChat } from '../../api/chat.js';
import { useChatStore } from '../../stores/chatStore.js';
import ChatBlock from './ChatBlock.jsx';
import ChatExportMenu from './ChatExportMenu.jsx';

function downloadBlock(block) {
  const text = block.messages.map(m =>
    m.role === 'user' ? `[你] ${m.content}` : `[${block.characterName}] ${m.content}`
  ).join('\n\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `对话-${block.characterName}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ChatPane({
  worldId, worldData, playerStatus, currentScene, narrativeMode,
  onTurnComplete, tokenBudget = 4096, characters = [], activeCharacterId,
  apiConfig = {},
}) {
  const {
    blocks, streaming, ensureBlock, addMessage,
    updateLastMessage, getAllMessages, setStreaming,
  } = useChatStore();
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [blocks]);

  const activeChar = characters.find(c => c.id === activeCharacterId);

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming || !activeCharacterId) return;

    const blockId = ensureBlock(activeCharacterId, activeChar?.name || '未知');
    const userMsg = { role: 'user', content: text };
    addMessage(blockId, userMsg);
    setInput('');
    setStreaming(true);

    const allMessages = getAllMessages();
    const accRef = { current: '' };
    let streamCompleted = false;

    try {
      const { systemPrompt, trimmedChatHistory } = await buildContext({
        worldCard: worldData,
        chatHistory: allMessages,
        tokenBudget,
        mode: narrativeMode || 'ensemble',
        playerStatus,
        currentScene,
        characters,
        activeCharacters: [activeCharacterId],
      });

      addMessage(blockId, { role: 'assistant', content: '' });

      await streamChat({
        worldId,
        systemPrompt,
        messages: trimmedChatHistory,
        apiConfig,
        onDelta: (delta) => {
          accRef.current += delta;
          updateLastMessage(blockId, accRef.current);
        },
        onDone: () => {
          streamCompleted = true;
          setStreaming(false);
          onTurnComplete?.();
        },
      });
    } catch (err) {
      console.error('[ChatPane] send failed:', err);
      if (!streamCompleted) {
        const detail = err?.message || '未知错误';
        addMessage(blockId, { role: 'assistant', content: `（发生错误: ${detail}）`, error: true });
        setStreaming(false);
      }
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {blocks.map((block, i) => (
          <div key={block.id}>
            {i > 0 && blocks[i - 1].characterId !== block.characterId && (
              <div className="flex items-center gap-3 py-3">
                <div className="flex-1 border-t border-ink/10" />
                <span className="text-[10px] text-ink/30 shrink-0">
                  切换到与 {block.characterName} 的对话
                </span>
                <div className="flex-1 border-t border-ink/10" />
              </div>
            )}
            <ChatBlock
              block={block}
              isStreaming={streaming && i === blocks.length - 1}
              onExport={downloadBlock}
            />
          </div>
        ))}
        {blocks.length === 0 && (
          <p className="text-xs text-ink/30 text-center py-10">
            {activeCharacterId ? '开始书写你的故事…' : '请先在左侧选择一个角色'}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-ink/8 px-6 py-3 flex gap-3 items-end">
        <textarea
          className="flex-1 resize-none bg-transparent text-sm leading-relaxed placeholder:text-ink/30 focus:outline-none"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={activeCharacterId ? '继续书写…' : '请先选择对话角色'}
          disabled={streaming || !activeCharacterId}
        />
        <ChatExportMenu />
        <button
          className="text-xs text-ink/40 hover:text-ink transition-colors disabled:opacity-30 pb-0.5"
          onClick={handleSend}
          disabled={streaming || !input.trim() || !activeCharacterId}
        >
          发送
        </button>
      </div>
    </div>
  );
}
