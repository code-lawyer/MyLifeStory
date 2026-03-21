import { useState, useEffect } from 'react';
import { playerApi } from '../../api/player.js';
import Spinner from '../ui/Spinner.jsx';

export default function InventoryPanel({ worldId, onClose }) {
  const [inventory, setInventory] = useState(null);

  useEffect(() => {
    playerApi.get(worldId).then((p) => setInventory(p.inventory || []));
  }, [worldId]);

  async function handleDelete(itemId) {
    await playerApi.deleteItem(worldId, itemId);
    setInventory((prev) => prev.filter((i) => i.id !== itemId));
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-80 bg-white h-full shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">背包</h2>
          <button onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!inventory ? <Spinner /> : inventory.length === 0 ? (
            <p className="text-gray-400 text-sm">背包是空的</p>
          ) : (
            <ul className="space-y-3">
              {inventory.map((item) => (
                <li key={item.id} className="border rounded p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
                      {item.source_event && <p className="text-xs text-amber-600 mt-1">{item.source_event}</p>}
                    </div>
                    <button
                      className="text-red-500 text-xs hover:text-red-700 shrink-0"
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
