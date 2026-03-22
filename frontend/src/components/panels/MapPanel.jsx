import { useState, useEffect } from 'react';
import { scenesApi } from '../../api/scenes.js';
import Spinner from '../ui/Spinner.jsx';

export default function MapPanel({ worldId, onClose }) {
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    scenesApi.list(worldId)
      .then((data) => setScenes(data.scenes || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [worldId]);

  const [enterError, setEnterError] = useState(null);

  async function handleEnter(scene) {
    if (scene.is_locked) return;
    setEnterError(null);
    try {
      await scenesApi.enterScene(worldId, scene.id);
      onClose();
    } catch {
      setEnterError(scene.id);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} />
      <aside className="relative w-80 bg-parchment h-full border-l border-ink/8 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink/8">
          <h2 className="text-sm font-medium text-ink/80">地图</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-ink/40 hover:text-ink/70 text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? <Spinner /> : error ? (
            <p className="text-ink/40 text-sm">加载失败</p>
          ) : (
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
          )}
        </div>
      </aside>
    </div>
  );
}
