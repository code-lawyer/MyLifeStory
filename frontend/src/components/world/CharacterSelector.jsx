export default function CharacterSelector({ characters, active, onChange }) {
  function toggle(id) {
    if (active.includes(id)) {
      onChange(active.filter(a => a !== id));
    } else {
      onChange([...active, id]);
    }
  }

  if (characters.length === 0) return null;

  return (
    <div className="px-2">
      <p className="text-[10px] text-ink/30 uppercase tracking-wider mb-1">角色</p>
      <ul className="flex flex-col gap-0.5">
        {characters.map((c) => (
          <li key={c.id} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              id={`char-${c.id}`}
              checked={active.includes(c.id)}
              onChange={() => toggle(c.id)}
              className="h-3 w-3 rounded-sm accent-[#1a1a2e]"
            />
            <label
              htmlFor={`char-${c.id}`}
              className={`text-xs truncate cursor-pointer ${
                active.includes(c.id)
                  ? 'text-ink/80 font-medium'
                  : 'text-ink/40'
              }`}
            >
              {c.name}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
