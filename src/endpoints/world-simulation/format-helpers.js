// Shared formatting helpers for LLM prompt construction

export const fmtEvent = (event, prefix = '事件') =>
    `${prefix}（${event.impact_scope || 'moderate'}）：${event.title} — ${event.description || ''}`;
