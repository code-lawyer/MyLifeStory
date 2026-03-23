import { useState } from 'react';
import Button from '../ui/Button.jsx';

const MODES = [
  {
    key: 'intimate',
    label: '亲密模式',
    desc: '深入探索一两个角色的关系，以细腻的情感对话为主。',
    hint: '适合小世界、恋爱、师徒、宿敌等双人剧情',
  },
  {
    key: 'ensemble',
    label: '群像模式',
    desc: '多角色互动，小团体冒险，关系网络丰富。',
    hint: '适合中等世界、冒险队伍、校园、职场等群体故事',
  },
  {
    key: 'epic',
    label: '史诗模式',
    desc: '大规模世界事件驱动，政治、战争、文明冲突。',
    hint: '适合大世界、王国争霸、末日生存、星际征服等宏大叙事',
  },
];

export default function NarrativeModeStep({ value, onChange, onComplete }) {
  const [selected, setSelected] = useState(value || 'ensemble');

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-ink/50 mb-6 leading-relaxed">
        选择你想要的叙事模式。此选项将影响整个世界的互动风格，创建后无法更改。
      </p>

      <div className="space-y-3 mb-8">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setSelected(m.key)}
            className={`w-full text-left p-5 rounded-lg border transition-colors ${
              selected === m.key
                ? 'border-ink/40 bg-white/80'
                : 'border-ink/10 hover:border-ink/20'
            }`}
          >
            <p className="text-sm font-semibold text-ink">{m.label}</p>
            <p className="text-sm text-ink/60 mt-1">{m.desc}</p>
            <p className="text-xs text-ink/30 mt-2">{m.hint}</p>
          </button>
        ))}
      </div>

      <Button onClick={() => { onChange(selected); onComplete(); }}>
        确认模式
      </Button>
    </div>
  );
}
