export default function CharacterSelector({ characters, selectedId, onSelect }) {
  if (characters.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] text-ink/30 uppercase tracking-wider mb-2">对话角色</p>
      <div className="flex flex-col gap-1">
        {characters.map((c) => {
          const isSelected = selectedId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(isSelected ? null : c.id)}
              className={`text-left text-xs px-2.5 py-1.5 rounded transition-colors truncate ${
                isSelected
                  ? 'bg-ink/10 text-ink font-medium'
                  : 'text-ink/40 hover:text-ink/60 hover:bg-ink/5'
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
