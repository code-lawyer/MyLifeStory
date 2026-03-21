import { useState, useRef, useEffect } from 'react';
import { buildContext, streamChat } from '../../api/chat.js';
import Spinner from '../ui/Spinner.jsx';

export default function ChatPane({ worldId, worldData, playerStatus, narrativeMode, onTurnComplete }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
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
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStreaming(true);

    const chatHistory = [...messages, userMsg];
    // Plain object ref for streaming accumulation — avoids stale closure on index
    const accRef = { current: '' };

    try {
      const { systemPrompt, trimmedChatHistory } = await buildContext({
        worldCard: worldData,
        chatHistory,
        tokenBudget: 4096,
        mode: narrativeMode || 'ensemble',
        playerStatus,
      });

      // Append empty assistant placeholder
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      await streamChat({
        worldId,
        systemPrompt,
        messages: trimmedChatHistory,
        apiConfig: worldData?.apiConfig || {},
        onDelta: (delta) => {
          accRef.current += delta;
          const accumulated = accRef.current;
          // Replace the last message (the assistant placeholder) with current text
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: accumulated };
            return next;
          });
        },
        onDone: () => {
          setStreaming(false);
          onTurnComplete?.();
        },
      });
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '（发生错误，请重试）', error: true },
      ]);
      setStreaming(false);
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
      <ul className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <li
            key={i}
            className={`max-w-prose rounded-lg px-4 py-2 ${
              msg.role === 'user'
                ? 'ml-auto bg-blue-600 text-white'
                : msg.error
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-900'
            }`}
          >
            {msg.content}
            {msg.role === 'assistant' && streaming && !msg.content && (
              <Spinner />
            )}
          </li>
        ))}
        <div ref={bottomRef} />
      </ul>
      <div className="border-t p-3 flex gap-2">
        <textarea
          className="flex-1 resize-none rounded border p-2 text-sm"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息…"
          disabled={streaming}
        />
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          onClick={handleSend}
          disabled={streaming || !input.trim()}
        >
          发送
        </button>
      </div>
    </div>
  );
}
