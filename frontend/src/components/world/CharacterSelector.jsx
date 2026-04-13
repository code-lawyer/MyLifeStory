import { TIER_DOTS } from '../../constants/tiers.js';

export default function CharacterSelector({ characters, selectedId, onSelect, onInfo, relationships = {} }) {
  if (characters.length === 0) return (
    <div>
      <p className="text-[10px] text-ink/30 uppercase tracking-wider mb-2">对话角色</p>
      <p className="text-xs text-ink/20">当前场景无角色</p>
    </div>
  );

  return (
    <div>
      <p className="text-[10px] text-ink/30 uppercase tracking-wider mb-2">对话角色</p>
      <div className="flex flex-col gap-1">
        {characters.map((c) => {
          const isSelected = selectedId === c.id;
          const dot = TIER_DOTS[c.tier] || '';
          const fam = relationships[c.id]?.familiarity || 0;
          return (
            <div key={c.id} className="group flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => onSelect(isSelected ? null : c.id)}
                className={`flex-1 text-left text-xs px-2.5 py-2 rounded transition-colors flex items-center justify-between min-w-0 ${
                  isSelected
                    ? 'bg-ink/10 text-ink font-medium'
                    : 'text-ink/40 hover:text-ink/60 hover:bg-ink/5 focus-visible:text-ink focus-visible:bg-ink/5'
                }`}
              >
                <span className="truncate">
                  {dot && <span className="mr-1 text-[10px]">{dot}</span>}{c.name}
                </span>
                {fam > 0 && <span className="text-[9px] text-ink/25 ml-1 shrink-0">{fam}</span>}
              </button>
              {onInfo && (
                <button
                  type="button"
                  onClick={() => onInfo(c)}
                  aria-label="查看角色详情"
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[10px] text-ink/25 hover:text-ink/60 focus-visible:text-ink transition-all px-2 py-2 rounded shrink-0"
                >
                  ···
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
