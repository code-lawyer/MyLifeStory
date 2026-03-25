import { marked } from 'marked';
import DOMPurify from 'dompurify';

function renderMarkdown(text) {
  return { __html: DOMPurify.sanitize(marked.parse(text || '')) };
}

export default function ChatBlock({ block, isStreaming, onExport }) {
  if (block.characterId === '__system__') {
    return (
      <div className="px-4 py-2 text-center">
        <p className="text-xs text-ink/40 italic">{block.messages[0]?.content}</p>
      </div>
    );
  }

  return (
    <div className="border border-ink/10 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-ink/3 border-b border-ink/8">
        <span className="text-xs font-medium text-ink/60">{block.characterName || '未知角色'}</span>
        <button
          onClick={() => onExport?.(block)}
          className="text-[10px] text-ink/30 hover:text-ink/60 transition-colors"
        >
          导出
        </button>
      </div>
      <div className="px-4 py-3 space-y-3">
        {block.messages.map((msg, i) => (
          <div key={i} className={msg.role === 'user' ? 'text-right' : ''}>
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
                  isStreaming && i === block.messages.length - 1 && (
                    <span className="inline-block w-1.5 h-4 bg-ink/30 animate-pulse ml-0.5 align-text-bottom" />
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
