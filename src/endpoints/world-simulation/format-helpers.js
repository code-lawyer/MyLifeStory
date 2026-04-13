// Shared formatting helpers for LLM prompt construction

export const PERIOD_LABELS = { morning: '清晨', afternoon: '午后', evening: '傍晚', night: '深夜' };
export const NARRATIVE_MODE_LABELS = { intimate: '亲密', ensemble: '群像', epic: '史诗' };

export const fmtEvent = (event, prefix = '事件') =>
    `${prefix}（${event.impact_scope || 'moderate'}）：${event.title} — ${event.description || ''}`;
