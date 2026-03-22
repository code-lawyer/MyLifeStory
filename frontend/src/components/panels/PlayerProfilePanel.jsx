import { useState, useEffect } from 'react';
import { playerApi } from '../../api/player.js';
import Spinner from '../ui/Spinner.jsx';

export default function PlayerProfilePanel({ worldId, onClose }) {
  const [player, setPlayer] = useState(null);
  const [status, setStatus] = useState({ health: 0, mental: 0, reputation: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
    playerApi.get(worldId)
      .then((p) => {
        setPlayer(p);
        setStatus({
          health: p.status?.health ?? 0,
          mental: p.status?.mental ?? 0,
          reputation: p.status?.reputation ?? 0,
        });
      })
      .catch(() => setError(true));
  }, [worldId]);

  async function handleSave() {
    setSaving(true);
    try {
      await playerApi.updateStatus(worldId, status);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} />
      <aside className="relative w-80 bg-parchment h-full border-l border-ink/8 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink/8">
          <h2 className="text-sm font-medium text-ink/80">角色状态</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-ink/40 hover:text-ink/70 text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!player ? (error ? <p className="text-ink/40 text-sm">加载失败</p> : <Spinner />) : (
            <div className="space-y-4">
              <p className="text-ink/80 font-medium">{player.name}</p>
              {[
                { key: 'health', label: '生命值' },
                { key: 'mental', label: '精神值' },
                { key: 'reputation', label: '声望' },
              ].map(({ key, label }) => (
                <label key={key} className="block text-sm">
                  <span className="text-ink/50 text-xs">{label}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="mt-1 block w-full border-b border-ink/15 bg-transparent px-1 py-1 text-ink/80 focus:border-ink/40 focus:outline-none"
                    value={status[key]}
                    onChange={(e) => setStatus((s) => ({ ...s, [key]: Number(e.target.value) }))}
                  />
                </label>
              ))}
              <button
                className="w-full py-1.5 text-sm bg-ink text-parchment rounded disabled:opacity-50"
                onClick={handleSave}
                disabled={saving}
              >
                保存
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
