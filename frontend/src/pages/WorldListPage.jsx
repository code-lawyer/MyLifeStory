import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { worldsApi } from '../api/worlds.js';
import Spinner from '../components/ui/Spinner.jsx';
import Button from '../components/ui/Button.jsx';

export default function WorldListPage() {
  const [worlds, setWorlds] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    worldsApi.list()
      .then(setWorlds)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-parchment flex items-center justify-center">
        <div role="alert" className="text-red-600 text-center">
          <p className="font-medium">加载失败</p>
          <p className="text-sm">{error}</p>
          <Button variant="secondary" className="mt-4" onClick={() => window.location.reload()}>重试</Button>
        </div>
      </div>
    );
  }

  if (worlds === null) {
    return <div className="min-h-screen bg-parchment"><Spinner /></div>;
  }

  return (
    <div className="min-h-screen bg-parchment">
      <header className="border-b border-ink/10 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">世界模拟器</h1>
        <Link
          to="/create/world"
          className="inline-flex items-center px-4 py-2 bg-ink text-parchment rounded-md font-medium hover:bg-ink/80 transition-colors"
        >
          创建新世界
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {worlds.length === 0 ? (
          <div className="text-center py-16 text-ink/50">
            <p className="text-lg">还没有世界</p>
            <p className="text-sm mt-2">点击右上角「创建新世界」开始</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {worlds.map((world) => (
              <button
                key={world.id}
                onClick={() => navigate(`/world/${world.id}`)}
                className="text-left p-5 bg-white rounded-lg border border-ink/10 hover:border-ink/30 hover:shadow-md transition-all"
              >
                <h2 className="font-bold text-ink text-lg">{world.name}</h2>
                {world.foundation?.background && (
                  <p className="text-ink/60 text-sm mt-1 line-clamp-2">{world.foundation.background}</p>
                )}
                <p className="text-ink/40 text-xs mt-3">{new Date(world.created_at || 0).toLocaleDateString('zh-CN')}</p>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
