import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { worldsApi } from '../api/worlds.js';
import Spinner from '../components/ui/Spinner.jsx';
import Button from '../components/ui/Button.jsx';

export default function WorldListPage() {
  const [worlds, setWorlds] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const loadWorlds = useCallback(() => {
    setWorlds(null);
    setError(null);
    worldsApi.list()
      .then(setWorlds)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadWorlds();
  }, [loadWorlds]);

  if (error) {
    return (
      <div className="min-h-screen bg-parchment flex items-center justify-center">
        <div role="alert" className="text-center">
          <p className="text-sm font-medium text-ink">加载失败</p>
          <p className="text-xs text-ink/50 mt-1">{error}</p>
          <Button variant="secondary" className="mt-4" onClick={loadWorlds}>重试</Button>
        </div>
      </div>
    );
  }

  if (worlds === null) {
    return <div className="min-h-screen bg-parchment"><Spinner /></div>;
  }

  return (
    <div className="min-h-screen bg-parchment">
      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-lg font-medium text-ink">世界模拟器</h1>
          <Link
            to="/create/world"
            className="text-ink/50 hover:text-ink/80 transition-colors text-sm"
          >
            创建新世界
          </Link>
        </div>

        {worlds.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-ink/40">还没有世界</p>
            <p className="text-xs text-ink/30 mt-1">点击右上角「创建新世界」开始</p>
          </div>
        ) : (
          <div>
            {worlds.map((world) => (
              <Link
                key={world.id}
                to={`/world/${world.id}`}
                className="block py-3 border-b border-ink/8 hover:bg-ink/3 transition-colors"
              >
                <h2 className="text-sm font-medium text-ink">{world.name}</h2>
                {world.foundation?.background && (
                  <p className="text-xs text-ink/50 mt-0.5 line-clamp-2">{world.foundation.background}</p>
                )}
                <p className="text-[10px] text-ink/30 mt-1">{world.created_at ? new Date(world.created_at).toLocaleDateString('zh-CN') : '—'}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
