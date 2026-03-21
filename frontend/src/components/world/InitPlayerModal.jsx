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
        id: `player-${worldId}`,
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-80 shadow-xl">
        <h2 className="text-lg font-semibold mb-4">创建你的角色</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>角色名</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border rounded px-3 py-2"
              placeholder="输入角色名"
              autoFocus
            />
          </label>
          {error && <p role="alert" className="text-sm text-red-600">创建失败，请重试</p>}
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            开始冒险
          </button>
        </form>
      </div>
    </div>
  );
}
