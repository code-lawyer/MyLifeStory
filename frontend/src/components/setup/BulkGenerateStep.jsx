import { useState, useEffect, useRef } from 'react';
import { generateApi } from '../../api/generate.js';
import { charactersApi } from '../../api/characters.js';
import { scenesApi } from '../../api/scenes.js';
import Button from '../ui/Button.jsx';

const PHASE_HINTS = [
  '正在构思传奇人物…',
  '正在创建精英角色…',
  '正在填充世界居民…',
  '正在搭建世界场景…',
];

const TIER_LABELS = { legendary: '传奇', elite: '精英', normal: '普通', disposable: '无用' };

export default function BulkGenerateStep({ worldId, worldContext, scale, apiConfig, onComplete }) {
  const [phase, setPhase] = useState('idle'); // idle | npcs | scenes | review
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [hint, setHint] = useState('');
  const [errors, setErrors] = useState([]);
  const [generatedNpcs, setGeneratedNpcs] = useState([]);
  const [generatedScenes, setGeneratedScenes] = useState([]);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runGeneration();
  }, []);

  // Rotate hints during generation
  useEffect(() => {
    if (phase === 'idle' || phase === 'review') return;
    const idx = phase === 'npcs' ? 0 : 3;
    setHint(PHASE_HINTS[idx]);
    const timer = setInterval(() => {
      if (phase === 'npcs') {
        setHint((prev) => {
          const i = PHASE_HINTS.indexOf(prev);
          return PHASE_HINTS[Math.min(i + 1, 2)] || prev;
        });
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [phase]);

  async function runGeneration() {
    // Phase 1: NPCs
    setPhase('npcs');
    const collectedNpcs = [];
    try {
      await generateApi.bulkNpcs(worldId, worldContext, scale, apiConfig, (event) => {
        if (event.type === 'progress') {
          setProgress({ done: event.done, total: event.total });
          if (event.item) {
            collectedNpcs.push(event.item);
            setGeneratedNpcs((prev) => [...prev, event.item]);
          }
        }
        if (event.type === 'error') setErrors((prev) => [...prev, event.message]);
      });
    } catch (err) {
      setErrors((prev) => [...prev, `NPC 生成失败: ${err.message}`]);
    }

    // Phase 2: Scenes — pass collected NPCs for character distribution
    setPhase('scenes');
    setProgress({ done: 0, total: 0 });
    try {
      await generateApi.scenes(worldId, worldContext, scale, apiConfig, (event) => {
        if (event.type === 'progress') {
          setProgress({ done: event.done, total: event.total });
          if (event.item) setGeneratedScenes((prev) => [...prev, event.item]);
        }
        if (event.type === 'error') setErrors((prev) => [...prev, event.message]);
      }, collectedNpcs);
    } catch (err) {
      setErrors((prev) => [...prev, `场景生成失败: ${err.message}`]);
    }

    setPhase('review');
  }

  async function handleDeleteNpc(id) {
    try { await charactersApi.delete(id); } catch { /* ignore */ }
    setGeneratedNpcs((prev) => prev.filter((n) => n.id !== id));
  }

  async function handleDeleteScene(id) {
    try { await scenesApi.delete(worldId, id); } catch { /* ignore */ }
    setGeneratedScenes((prev) => prev.filter((s) => s.id !== id));
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const keyNpcs = generatedNpcs.filter((n) => n.tier === 'legendary' || n.tier === 'elite');
  const otherNpcs = generatedNpcs.filter((n) => n.tier !== 'legendary' && n.tier !== 'elite');

  return (
    <div className="max-w-3xl">
      {/* Progress bar during generation */}
      {phase !== 'review' && phase !== 'idle' && (
        <>
          <p className="text-sm text-ink/50 mb-2">{hint}</p>
          <div className="mb-6">
            <div className="h-2 bg-ink/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-ink/30 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between mt-2">
              <p className="text-xs text-ink/40">{progress.done} / {progress.total}</p>
              <p className="text-xs text-ink/30">{phase === 'npcs' ? 'NPC' : '场景'}</p>
            </div>
          </div>
          {/* Live feed of generated items */}
          {generatedNpcs.length > 0 && phase === 'npcs' && (
            <div className="mb-4 text-xs text-ink/40 space-y-0.5">
              {generatedNpcs.slice(-3).map((n) => (
                <p key={n.id}>+ {TIER_LABELS[n.tier] || n.tier} · {n.name}</p>
              ))}
            </div>
          )}
          {generatedScenes.length > 0 && phase === 'scenes' && (
            <div className="mb-4 text-xs text-ink/40 space-y-0.5">
              {generatedScenes.slice(-3).map((s) => (
                <p key={s.id}>+ {s.name}</p>
              ))}
            </div>
          )}
        </>
      )}

      {/* Review phase — editable lists */}
      {phase === 'review' && (
        <>
          <p className="text-sm text-ink/50 mb-6">生成完成！检查以下内容，可删除不需要的条目。</p>

          {/* Key NPCs (legendary + elite) */}
          {keyNpcs.length > 0 && (
            <div className="border border-ink/10 rounded-lg p-5 mb-5">
              <p className="text-xs text-ink/40 uppercase tracking-wider mb-3">传奇 & 精英 NPC</p>
              <div className="space-y-1.5">
                {keyNpcs.map((n) => (
                  <div key={n.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink/70">
                      <span className="text-xs text-ink/30 mr-2">{TIER_LABELS[n.tier]}</span>
                      {n.name}
                    </span>
                    <button
                      onClick={() => handleDeleteNpc(n.id)}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Other NPCs (collapsed by default) */}
          {otherNpcs.length > 0 && (
            <details className="border border-ink/10 rounded-lg p-5 mb-5">
              <summary className="text-xs text-ink/40 uppercase tracking-wider cursor-pointer">
                普通 & 无用 NPC（{otherNpcs.length}）
              </summary>
              <div className="space-y-1.5 mt-3">
                {otherNpcs.map((n) => (
                  <div key={n.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink/50">{n.name}</span>
                    <button
                      onClick={() => handleDeleteNpc(n.id)}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Scenes */}
          {generatedScenes.length > 0 && (
            <div className="border border-ink/10 rounded-lg p-5 mb-6">
              <p className="text-xs text-ink/40 uppercase tracking-wider mb-3">场景</p>
              <div className="space-y-1.5">
                {generatedScenes.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink/70">{s.name}</span>
                    <button
                      onClick={() => handleDeleteScene(s.id)}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="mb-4 text-xs text-red-500">
              {errors.slice(-3).map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}

          <Button onClick={onComplete}>进入世界</Button>
        </>
      )}
    </div>
  );
}
