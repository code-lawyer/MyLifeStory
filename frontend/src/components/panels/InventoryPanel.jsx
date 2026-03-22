import { useState, useEffect } from 'react';
import { playerApi } from '../../api/player.js';
import Spinner from '../ui/Spinner.jsx';

export default function InventoryPanel({ worldId, onClose }) {
  const [inventory, setInventory] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
    playerApi.get(worldId)
      .then((p) => setInventory(p.inventory || []))
      .catch(() => setError(true));
  }, [worldId]);

  async function handleDelete(itemId) {
    try {
      await playerApi.deleteItem(worldId, itemId);
      setInventory((prev) => prev.filter((i) => i.id !== itemId));
    } catch {
      // Delete failed — leave inventory unchanged
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} />
      <aside className="relative w-80 bg-parchment h-full border-l border-ink/8 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink/8">
          <h2 className="text-sm font-medium text-ink/80">背包</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-ink/40 hover:text-ink/70 text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!inventory ? (error ? <p className="text-ink/40 text-sm">加载失败</p> : <Spinner />) : inventory.length === 0 ? (
            <p className="text-ink/30 text-sm">背包是空的</p>
          ) : (
            <ul className="space-y-2">
              {inventory.map((item) => (
                <li key={item.id} className="border-b border-ink/8 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-ink/80">{item.name}</p>
                      {item.description && <p className="text-xs text-ink/50 mt-0.5">{item.description}</p>}
                      {item.source_event && <p className="text-xs text-ink/40 mt-0.5">{item.source_event}</p>}
                    </div>
                    <button
                      className="text-ink/40 text-xs hover:text-ink/70 shrink-0"
                      onClick={() => handleDelete(item.id)}
                      aria-label="删除"
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
