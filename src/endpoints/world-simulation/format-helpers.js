// Shared formatting helpers for LLM prompt construction

export const PERIOD_LABELS = { morning: '清晨', afternoon: '午后', evening: '傍晚', night: '深夜' };

export const fmtEvent = (event, prefix = '事件') =>
    `${prefix}（${event.impact_scope || 'moderate'}）：${event.title} — ${event.description || ''}`;
