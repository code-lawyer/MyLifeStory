import { useState } from 'react';
import { playerApi } from '../../api/player.js';
import SlidePanel from './SlidePanel.jsx';

export default function PlayerProfilePanel({ worldId, player, onClose, onUpdate }) {
  const [status, setStatus] = useState({
    health: player?.status?.health ?? 0,
    mental: player?.status?.mental ?? 0,
    reputation: player?.status?.reputation ?? 0,
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await playerApi.updateStatus(worldId, status);
      onUpdate?.(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SlidePanel title="角色状态" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-ink/80 font-medium">{player?.name}</p>
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
    </SlidePanel>
  );
}
