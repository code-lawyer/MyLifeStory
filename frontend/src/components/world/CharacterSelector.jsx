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
      <p className="text-xs text-gray-500 uppercase mb-1">角色</p>
      <ul className="flex flex-col gap-1">
        {characters.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`char-${c.id}`}
              checked={active.includes(c.id)}
              onChange={() => toggle(c.id)}
              className="rounded"
            />
            <label htmlFor={`char-${c.id}`} className="text-sm truncate cursor-pointer">
              {c.name}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
