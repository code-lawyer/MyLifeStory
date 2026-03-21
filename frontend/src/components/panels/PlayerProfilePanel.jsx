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
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-80 bg-white h-full shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">角色状态</h2>
          <button onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!player ? (error ? <p className="text-red-500 text-sm">加载失败</p> : <Spinner />) : (
            <div className="space-y-4">
              <p className="font-semibold text-xl">{player.name}</p>
              {[
                { key: 'health', label: '生命值' },
                { key: 'mental', label: '精神值' },
                { key: 'reputation', label: '声望' },
              ].map(({ key, label }) => (
                <label key={key} className="block text-sm">
                  <span className="text-gray-600">{label}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={status[key]}
                    onChange={(e) => setStatus((s) => ({ ...s, [key]: Number(e.target.value) }))}
                  />
                </label>
              ))}
              <button
                className="w-full py-2 bg-blue-600 text-white rounded disabled:opacity-50"
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
