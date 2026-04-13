import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { worldsApi } from '../api/worlds.js';
import { useSettingsStore } from '../stores/settingsStore.js';
import Spinner from '../components/ui/Spinner.jsx';
import Button from '../components/ui/Button.jsx';
import { triggerDownload } from '../utils/chat-export.js';

export default function WorldListPage() {
  const [worlds, setWorlds] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { apiKey, apiUrl, model } = useSettingsStore();
  const apiConfigured = !!(apiKey && apiUrl && model);
  const fileInputRef = useRef(null);

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

  async function handleDelete(e, world) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`确认删除「${world.name}」？此操作不可恢复。`)) return;
    try {
      await worldsApi.delete(world.id);
      setWorlds((prev) => prev.filter(w => w.id !== world.id));
    } catch {
      alert('删除失败');
    }
  }

  async function handleExport(e, worldId) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const bundle = await worldsApi.exportWorld(worldId);
      const safeName = (bundle.world?.name || worldId).replace(/[<>:"/\\|?*]/g, '_').slice(0, 50);
      triggerDownload(`world-${safeName}.json`, new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    } catch {
      alert('导出失败');
    }
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      if (!bundle.world) { alert('无效的世界卡文件'); return; }
      await worldsApi.importWorld(bundle);
      loadWorlds();
    } catch {
      alert('导入失败');
    }
    e.target.value = '';
  }

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
      {/* Top navigation */}
      <header className="border-b border-ink/8 px-10 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-base font-semibold text-ink tracking-wide">世界模拟器</h1>
          <nav className="flex items-center gap-6">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm text-ink/60 hover:text-ink/90 transition-colors"
            >
              导入世界
            </button>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
            <Link
              to="/create/world"
              className="text-sm text-ink/60 hover:text-ink/90 transition-colors"
            >
              + 创建新世界
            </Link>
            <Link
              to="/settings"
              className="text-sm text-ink/60 hover:text-ink/90 transition-colors"
            >
              设置
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-10 py-10">
        {/* API 配置缺失提示 */}
        {!apiConfigured && (
          <div className="mb-8 px-5 py-4 border border-amber-200 bg-amber-50 rounded-lg flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-amber-800">尚未配置 API</p>
              <p className="text-xs text-amber-700 mt-0.5">
                使用 AI 生成功能前，需要先在「设置」中填写 API URL、API Key 和模型名称。
              </p>
            </div>
            <Link
              to="/settings"
              className="shrink-0 text-xs font-medium text-amber-800 border border-amber-300 rounded px-3 py-1.5 hover:bg-amber-100 transition-colors"
            >
              去设置
            </Link>
          </div>
        )}

        {worlds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <p className="text-base text-ink/40">还没有世界</p>
            <p className="text-sm text-ink/30 mt-1 mb-6">点击右上角「创建新世界」或「导入世界」开始</p>
            <Link
              to="/create/world"
              className="text-sm text-ink/60 hover:text-ink/90 border border-ink/15 rounded px-4 py-2 transition-colors"
            >
              创建第一个世界
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {worlds.map((world) => (
              <div
                key={world.id}
                className="relative block p-5 border border-ink/10 rounded-lg hover:border-ink/25 hover:bg-ink/2 transition-all"
              >
                <Link to={`/world/${world.id}`} className="block">
                  <h2 className="text-sm font-semibold text-ink mb-1">{world.name}</h2>
                  {world.foundation?.background && (
                    <p className="text-xs text-ink/50 line-clamp-3 leading-relaxed">{world.foundation.background}</p>
                  )}
                  <p className="text-[11px] text-ink/30 mt-3">
                    {world.created_at ? new Date(world.created_at).toLocaleDateString('zh-CN') : '—'}
                  </p>
                </Link>
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleExport(e, world.id)}
                    className="text-[10px] text-ink/30 hover:text-ink/60 focus-visible:text-ink focus-visible:bg-ink/5 rounded px-2 py-2 transition-colors"
                  >
                    导出
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, world)}
                    className="text-[10px] text-ink/30 hover:text-red-500 focus-visible:text-red-600 focus-visible:bg-red-50 rounded px-2 py-2 transition-colors"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
