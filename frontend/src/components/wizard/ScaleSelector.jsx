const SCALES = [
  {
    key: 'small',
    label: '小世界',
    desc: '15 个 NPC · 6 个场景',
    tokens: '~3,000 tokens',
  },
  {
    key: 'medium',
    label: '中世界',
    desc: '30 个 NPC · 15 个场景',
    tokens: '~10,000 tokens',
  },
  {
    key: 'large',
    label: '大世界',
    desc: '65 个 NPC · 35 个场景',
    tokens: '~25,000 tokens',
  },
];

export default function ScaleSelector({ value, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {SCALES.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onChange(s.key)}
          className={`text-left p-4 rounded-lg border transition-colors ${
            value === s.key
              ? 'border-ink/40 bg-white/80'
              : 'border-ink/10 hover:border-ink/20'
          }`}
        >
          <p className="text-sm font-semibold text-ink">{s.label}</p>
          <p className="text-xs text-ink/50 mt-1">{s.desc}</p>
          <p className="text-xs text-ink/30 mt-2">{s.tokens}</p>
        </button>
      ))}
    </div>
  );
}
