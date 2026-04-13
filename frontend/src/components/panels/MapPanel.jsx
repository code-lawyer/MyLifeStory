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
              className={`w-full text-left px-3 py-2.5 text-sm rounded ${
                scene.is_locked
                  ? 'text-ink/30 cursor-not-allowed'
                  : 'text-ink/70 hover:text-ink hover:bg-ink/5 focus-visible:text-ink focus-visible:bg-ink/10'
              }`}
              onClick={() => handleEnter(scene)}
              disabled={scene.is_locked}
            >
              <span className="flex items-center gap-1">
                {scene.is_locked && <span className="text-ink/30">🔒</span>}
                {scene.name}
              </span>
              {scene.is_locked && scene.unlock_condition && (
                <span className="block text-xs text-ink/30 mt-0.5 pl-5">{scene.unlock_condition}</span>
              )}
              {enterError === scene.id && <span className="block text-xs text-ink/40 mt-0.5">进入失败</span>}
            </button>
          </li>
        ))}
      </ul>
    </SlidePanel>
  );
}
