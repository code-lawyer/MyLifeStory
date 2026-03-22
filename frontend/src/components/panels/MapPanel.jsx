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
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-80 bg-white h-full shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">地图</h2>
          <button onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? <Spinner /> : error ? (
            <p className="text-red-500 text-sm">加载失败</p>
          ) : (
            <ul className="space-y-2">
              {scenes.map((scene) => (
                <li key={scene.id}>
                  <button
                    className={`w-full text-left px-3 py-2 rounded border ${
                      scene.is_locked
                        ? 'opacity-40 cursor-not-allowed border-gray-200 text-gray-500'
                        : 'hover:bg-blue-50 border-gray-200'
                    }`}
                    title={scene.is_locked ? scene.unlock_condition : undefined}
                    onClick={() => handleEnter(scene)}
                    disabled={scene.is_locked}
                  >
                    {scene.name}
                    {scene.is_locked && <span className="ml-2 text-xs">🔒</span>}
                    {enterError === scene.id && <span className="block text-xs text-red-500 mt-1">进入失败</span>}
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
