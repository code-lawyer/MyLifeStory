import { useState } from 'react';
import { playerApi } from '../../api/player.js';
import SlidePanel from './SlidePanel.jsx';

export default function InventoryPanel({ worldId, inventory: initialInventory, onClose, onUpdate }) {
  const [inventory, setInventory] = useState(initialInventory || []);

  async function handleDelete(itemId) {
    try {
      await playerApi.deleteItem(worldId, itemId);
      const next = inventory.filter((i) => i.id !== itemId);
      setInventory(next);
      onUpdate?.(next);
    } catch {
      // Delete failed — leave inventory unchanged
    }
  }

  return (
    <SlidePanel title="背包" onClose={onClose}>
      {inventory.length === 0 ? (
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
    </SlidePanel>
  );
}
