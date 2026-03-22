import { useState } from 'react';
import { scenesApi } from '../../api/scenes.js';
import SlidePanel from './SlidePanel.jsx';

export default function MapPanel({ worldId, scenes, onClose, onEnter }) {
  const [enterError, setEnterError] = useState(null);

  async function handleEnter(scene) {
    if (scene.is_locked) return;
    setEnterError(null);
    try {
      const result = await scenesApi.enterScene(worldId, scene.id);
      onEnter?.(result);
      onClose();
    } catch {
      setEnterError(scene.id);
    }
  }

  return (
    <SlidePanel title="地图" onClose={onClose}>
      <ul className="space-y-1">
        {scenes.map((scene) => (
          <li key={scene.id}>
            <button
              className={`w-full text-left px-2 py-1.5 text-sm rounded ${
                scene.is_locked
                  ? 'text-ink/30 cursor-not-allowed'
                  : 'text-ink/70 hover:text-ink hover:bg-ink/5'
              }`}
              title={scene.is_locked ? scene.unlock_condition : undefined}
              onClick={() => handleEnter(scene)}
              disabled={scene.is_locked}
            >
              {scene.name}
              {scene.is_locked && <span className="ml-1 text-xs text-ink/30">(锁定)</span>}
              {enterError === scene.id && <span className="block text-xs text-ink/40 mt-0.5">进入失败</span>}
            </button>
          </li>
        ))}
      </ul>
    </SlidePanel>
  );
}
