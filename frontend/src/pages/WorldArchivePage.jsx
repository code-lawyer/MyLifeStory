import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { worldsApi } from '../api/worlds.js';
import { eventsApi } from '../api/events.js';
import { charactersApi } from '../api/characters.js';
import { scenesApi } from '../api/scenes.js';
import Spinner from '../components/ui/Spinner.jsx';

const IMPACT_LABELS = {
  minor: '微',
  moderate: '中',
  major: '重',
};

const TABS = ['events', 'characters', 'scenes'];
const TAB_LABELS = { events: '事件', characters: '角色', scenes: '场景' };

const TIER_ORDER = ['legendary', 'elite', 'normal', 'disposable'];
const TIER_LABELS = { legendary: '传奇', elite: '精英', normal: '普通', disposable: '龙套' };

export default function WorldArchivePage() {
  const { worldId } = useParams();
  const [world, setWorld] = useState(null);
  const [events, setEvents] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState('events');

  useEffect(() => {
    Promise.all([
      worldsApi.get(worldId),
      eventsApi.list(worldId),
      charactersApi.listByWorld(worldId),
      scenesApi.list(worldId),
    ]).then(([w, e, c, s]) => {
      setWorld(w);
      setEvents(e.events || []);
      setCharacters(c);
      setScenes(s.scenes || []);
    }).catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [worldId]);

  async function handleDeleteEvent(eventId) {
    try {
      await eventsApi.delete(worldId, eventId);
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
    } catch {
      // Delete failed — leave events list unchanged
    }
  }

  if (loading) return <div className="min-h-screen bg-parchment flex items-center justify-center"><Spinner /></div>;
  if (error) return <div className="min-h-screen bg-parchment flex items-center justify-center"><p className="text-ink/50 text-sm">加载失败</p></div>;

  return (
    <div className="min-h-screen bg-parchment">
      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center gap-4 mb-6">
          <Link to={`/world/${worldId}`} className="text-ink/40 hover:text-ink/70 transition-colors text-sm">← 返回游戏</Link>
          <h1 className="text-lg font-medium text-ink">{world?.name} <span className="text-ink/30 font-normal">档案</span></h1>
        </div>

        {/* Current State */}
        <div className="mb-8">
          <p className="text-xs text-ink/40 uppercase tracking-wider mb-2">当前状态</p>
          <p className="text-sm text-ink/70 leading-relaxed">{world?.current_state?.summary || '暂无记录'}</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-6 mb-6 border-b border-ink/8">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 text-sm transition-colors ${
                activeTab === tab
                  ? 'text-ink font-medium border-b border-ink'
                  : 'text-ink/40 hover:text-ink/60'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Events Tab */}
        {activeTab === 'events' && (events.length === 0 ? (
          <p className="text-xs text-ink/30">暂无事件</p>
        ) : events.map((event) => (
          <div key={event.id} className="py-3 border-b border-ink/8 flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">
                {event.title}
                <span className="text-[10px] text-ink/30 ml-2 font-normal">{IMPACT_LABELS[event.impact_scope] || event.impact_scope}</span>
              </p>
              <p className="text-xs text-ink/50 mt-0.5">{event.description}</p>
            </div>
            <button
              className="text-[10px] text-ink/30 hover:text-ink/60 transition-colors shrink-0 mt-1"
              onClick={() => handleDeleteEvent(event.id)}
              aria-label="删除事件"
            >
              删除
            </button>
          </div>
        )))}

        {/* Characters Tab */}
        {activeTab === 'characters' && (characters.length === 0 ? (
          <p className="text-xs text-ink/30">暂无角色</p>
        ) : (
          <div className="space-y-2">
            {TIER_ORDER.map((tier) => {
              const group = characters.filter((c) => (c.tier || 'normal') === tier);
              if (group.length === 0) return null;
              return (
                <details key={tier} className="border border-ink/8 rounded-lg" open={tier === 'legendary' || tier === 'elite'}>
                  <summary className="px-4 py-2.5 cursor-pointer select-none flex items-center justify-between">
                    <span className="text-sm font-medium text-ink/70">{TIER_LABELS[tier] || tier}</span>
                    <span className="text-xs text-ink/30">{group.length}</span>
                  </summary>
                  <div className="px-4 pb-3">
                    {group.map((c) => (
                      <div key={c.id} className="py-1.5 border-t border-ink/5 first:border-t-0">
                        <p className="text-sm text-ink">{c.name}</p>
                        {c.identity?.description && (
                          <p className="text-xs text-ink/40 mt-0.5 line-clamp-1">{c.identity.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        ))}

        {/* Scenes Tab */}
        {activeTab === 'scenes' && (scenes.length === 0 ? (
          <p className="text-xs text-ink/30">暂无场景</p>
        ) : scenes.map((s) => (
          <div key={s.id} className="py-2 border-b border-ink/8 flex items-center">
            <p className="text-sm text-ink">{s.name}</p>
            {s.is_locked && <span className="ml-2 text-[10px] text-ink/30">未解锁</span>}
          </div>
        )))}
      </main>
    </div>
  );
}
