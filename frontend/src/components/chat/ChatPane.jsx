import { useState, useRef, useEffect } from 'react';
import { marked } from 'marked';
import { buildContext, streamChat } from '../../api/chat.js';
import { useChatStore } from '../../stores/chatStore.js';


marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(text) {
  return { __html: marked.parse(text || '') };
}

export default function ChatPane({
  worldId, worldData, playerStatus, currentScene, narrativeMode,
  onTurnComplete, tokenBudget = 4096, characters = [], activeCharacters,
  apiConfig = {},
}) {
  const { messages, streaming, setMessages, setStreaming } = useChatStore();
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current && typeof bottomRef.current.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setStreaming(true);

    const accRef = { current: '' };
    let streamCompleted = false;

    try {
      const { systemPrompt, trimmedChatHistory } = await buildContext({
        worldCard: worldData,
        chatHistory: nextMessages,
        tokenBudget,
        mode: narrativeMode || 'ensemble',
        playerStatus,
        currentScene,
        characters,
        activeCharacters,
      });

      setMessages([...nextMessages, { role: 'assistant', content: '' }]);

      await streamChat({
        worldId,
        systemPrompt,
        messages: trimmedChatHistory,
        apiConfig,
        onDelta: (delta) => {
          accRef.current += delta;
          const accumulated = accRef.current;
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: accumulated };
            return next;
          });
        },
        onDone: () => {
          streamCompleted = true;
          setStreaming(false);
          onTurnComplete?.();
        },
      });
    } catch {
      if (!streamCompleted) {
        setMessages([...nextMessages, { role: 'assistant', content: '（发生错误，请重试）', error: true }]);
        setStreaming(false);
      }
    }
  }

  async function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Message stream — journal style */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={
              msg.role === 'user'
                ? 'text-right'
                : ''
            }
          >
            {msg.role === 'user' ? (
              <p className="inline-block text-sm text-ink/50 max-w-prose text-right">{msg.content}</p>
            ) : (
              <div className="max-w-prose text-sm leading-relaxed">
                {msg.content ? (
                  <div
                    className={`prose prose-sm prose-stone ${msg.error ? 'text-ink/40' : 'text-ink/80'}`}
                    dangerouslySetInnerHTML={renderMarkdown(msg.content)}
                  />
                ) : (
                  streaming && i === messages.length - 1 && (
                    <span className="inline-block w-1.5 h-4 bg-ink/30 animate-pulse ml-0.5 align-text-bottom" />
                  )
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input — minimal */}
      <div className="border-t border-ink/8 px-6 py-3 flex gap-3 items-end">
        <textarea
          className="flex-1 resize-none bg-transparent text-sm leading-relaxed placeholder:text-ink/30 focus:outline-none"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="继续书写…"
          disabled={streaming}
        />
        <button
          className="text-xs text-ink/40 hover:text-ink transition-colors disabled:opacity-30 pb-0.5"
          onClick={handleSend}
          disabled={streaming || !input.trim()}
        >
          发送
        </button>
      </div>
    </div>
  );
}
