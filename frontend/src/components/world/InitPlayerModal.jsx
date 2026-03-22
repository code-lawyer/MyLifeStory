import { useState } from 'react';
import { playerApi } from '../../api/player.js';

export default function InitPlayerModal({ worldId, onCreated }) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      const player = await playerApi.create(worldId, {
        id: crypto.randomUUID(),
        world_id: worldId,
        name: name.trim(),
        status: { health: 100, mental: 100, reputation: 0, current_location: null },
        inventory: [],
      });
      onCreated(player);
    } catch {
      setError(true);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/20 flex items-center justify-center z-50">
      <div className="bg-parchment rounded p-6 w-80">
        <h2 className="text-sm font-medium text-ink/80 mb-4">创建你的角色</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink/50">角色名</span>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setError(false); }}
              className="border-b border-ink/15 bg-transparent px-1 py-1.5 text-ink/80 focus:border-ink/40 focus:outline-none"
              placeholder="输入角色名"
              autoFocus
            />
          </label>
          {error && <p role="alert" className="text-xs text-ink/40">创建失败，请重试</p>}
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="mt-1 py-1.5 text-sm bg-ink text-parchment rounded disabled:opacity-50"
          >
            开始冒险
          </button>
        </form>
      </div>
    </div>
  );
}
