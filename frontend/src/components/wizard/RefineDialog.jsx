import { useState } from 'react';

export default function RefineDialog({ section, suggestions = [], onConfirm, onCancel, onRefreshSuggestions }) {
  const [instruction, setInstruction] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    if (!onRefreshSuggestions) return;
    setRefreshing(true);
    try { await onRefreshSuggestions(); }
    finally { setRefreshing(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-parchment border border-ink/15 rounded-xl shadow-lg w-full max-w-md mx-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-ink">细化「{section}」</h3>
          {onRefreshSuggestions && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-[10px] text-ink/40 hover:text-ink/70 transition-colors disabled:opacity-40"
            >
              {refreshing ? '刷新中…' : '刷新建议'}
            </button>
          )}
        </div>

        {suggestions.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-ink/40 uppercase tracking-wider mb-2">AI 建议</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setInstruction(prev => prev ? `${prev}；${s}` : s)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-ink/10 text-ink/60 hover:border-ink/25 hover:text-ink/80 transition-colors text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <textarea
          className="w-full border border-ink/12 rounded-lg p-2.5 text-sm bg-white/60 focus:outline-none focus:border-ink/30 resize-none"
          rows={3}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="输入细化方向，或点击上方建议…"
        />
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onCancel} className="text-xs text-ink/40 hover:text-ink/70 px-3 py-1.5">取消</button>
          <button
            onClick={() => instruction.trim() && onConfirm(instruction.trim())}
            disabled={!instruction.trim()}
            className="text-xs bg-ink/8 hover:bg-ink/15 text-ink/70 px-4 py-1.5 rounded-lg disabled:opacity-30 transition-colors"
          >
            确认细化
          </button>
        </div>
      </div>
    </div>
  );
}
