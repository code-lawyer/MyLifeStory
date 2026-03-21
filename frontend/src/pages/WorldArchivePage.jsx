import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { worldsApi } from '../api/worlds.js';
import { eventsApi } from '../api/events.js';
import { charactersApi } from '../api/characters.js';
import { scenesApi } from '../api/scenes.js';
import Spinner from '../components/ui/Spinner.jsx';

const IMPACT_COLORS = {
  minor: 'bg-gray-100 text-gray-600',
  moderate: 'bg-blue-100 text-blue-700',
  major: 'bg-red-100 text-red-700',
};

export default function WorldArchivePage() {
  const { worldId } = useParams();
  const [world, setWorld] = useState(null);
  const [events, setEvents] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      worldsApi.get(worldId),
      eventsApi.list(worldId),
      charactersApi.list(worldId),
      scenesApi.list(worldId),
    ]).then(([w, e, c, s]) => {
      setWorld(w);
      setEvents(e.events || []);
      setCharacters(c);
      setScenes(s.scenes || []);
    }).finally(() => setLoading(false));
  }, [worldId]);

  async function handleDeleteEvent(eventId) {
    await eventsApi.delete(worldId, eventId);
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  }

  if (loading) return <div className="flex items-center justify-center h-screen"><Spinner /></div>;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      <div className="flex items-center gap-3">
        <Link to={`/world/${worldId}`} className="text-blue-600 hover:underline text-sm">← 返回游戏</Link>
        <h1 className="text-2xl font-bold"><span>{world?.name}</span> — 世界档案</h1>
      </div>

      {/* Current State */}
      <section>
        <h2 className="text-lg font-semibold mb-2">当前状态</h2>
        <p className="text-gray-700 bg-gray-50 rounded p-3">{world?.current_state?.summary || '暂无记录'}</p>
      </section>

      {/* Event Timeline */}
      <section>
        <h2 className="text-lg font-semibold mb-2">事件时间线</h2>
        {events.length === 0 ? (
          <p className="text-gray-400 text-sm">暂无事件</p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => (
              <li key={event.id} className="flex items-start gap-3 border rounded p-3">
                <span className={`text-xs px-2 py-0.5 rounded-full mt-0.5 shrink-0 ${IMPACT_COLORS[event.impact_scope] || IMPACT_COLORS.moderate}`}>
                  {event.impact_scope}
                </span>
                <div className="flex-1">
                  <p className="font-medium">{event.title}</p>
                  <p className="text-sm text-gray-600">{event.description}</p>
                </div>
                <button
                  className="text-xs text-red-500 hover:text-red-700 shrink-0"
                  onClick={() => handleDeleteEvent(event.id)}
                  aria-label="删除事件"
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Characters */}
      <section>
        <h2 className="text-lg font-semibold mb-2">角色列表</h2>
        {characters.length === 0 ? (
          <p className="text-gray-400 text-sm">暂无角色</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {characters.map((c) => (
              <li key={c.id} className="border rounded p-2 text-sm">{c.name}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Scenes */}
      <section>
        <h2 className="text-lg font-semibold mb-2">场景列表</h2>
        {scenes.length === 0 ? (
          <p className="text-gray-400 text-sm">暂无场景</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {scenes.map((s) => (
              <li key={s.id} className="border rounded p-2 text-sm">
                {s.name}
                {s.is_locked && <span className="ml-1 text-xs text-gray-400">🔒</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
