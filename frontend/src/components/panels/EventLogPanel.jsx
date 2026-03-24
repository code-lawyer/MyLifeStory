import SlidePanel from './SlidePanel.jsx';

const IMPACT_LABELS = { minor: '微', moderate: '中', major: '重' };
const IMPACT_COLORS = {
  minor: 'text-ink/30',
  moderate: 'text-amber-500/60',
  major: 'text-red-400/70',
};

export default function EventLogPanel({ events = [], summaries = [], onClose }) {
  const sorted = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <SlidePanel title="事件日志" onClose={onClose}>
      {summaries.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] text-ink/30 uppercase tracking-wider mb-1">历史摘要</p>
          <ul className="space-y-1">
            {summaries.map((s, i) => (
              <li key={i} className="text-xs text-ink/50 border-l-2 border-ink/10 pl-2">
                {s.summary}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sorted.length === 0 && summaries.length === 0 ? (
        <p className="text-ink/30 text-sm">暂无事件记录</p>
      ) : sorted.length > 0 ? (
        <ul className="space-y-3">
          {sorted.map((e) => {
            const color = IMPACT_COLORS[e.impact_scope] || IMPACT_COLORS.minor;
            const label = IMPACT_LABELS[e.impact_scope] || '微';
            return (
              <li key={e.id} className="border-b border-ink/8 pb-3">
                <div className="flex items-start gap-2">
                  <span className={`text-[10px] font-medium shrink-0 mt-0.5 ${color}`}>[{label}]</span>
                  <div>
                    <p className="text-sm text-ink/80">{e.title}</p>
                    {e.description && <p className="text-xs text-ink/50 mt-0.5">{e.description}</p>}
                    {e.timestamp && (
                      <p className="text-[10px] text-ink/30 mt-1">
                        {new Date(e.timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </SlidePanel>
  );
}
