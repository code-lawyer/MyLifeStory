import { useState, useEffect, useRef } from 'react';
import { generateApi } from '../../api/generate.js';
import Button from '../ui/Button.jsx';

export default function BulkGenerateStep({ worldId, worldContext, scale, apiConfig, onComplete }) {
  const [phase, setPhase] = useState('idle'); // idle | npcs | scenes | done
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState([]);
  const [summary, setSummary] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runGeneration();
  }, []);

  async function runGeneration() {
    // Phase 1: NPCs
    setPhase('npcs');
    let npcSummary = {};
    try {
      await generateApi.bulkNpcs(worldId, worldContext, scale, apiConfig, (event) => {
        if (event.type === 'progress') setProgress({ done: event.done, total: event.total });
        if (event.type === 'error') setErrors((prev) => [...prev, event.message]);
        if (event.type === 'done') npcSummary = event.summary || {};
      });
    } catch (err) {
      setErrors((prev) => [...prev, `NPC 生成失败: ${err.message}`]);
    }

    // Phase 2: Scenes
    setPhase('scenes');
    setProgress({ done: 0, total: 0 });
    let sceneSummary = {};
    try {
      await generateApi.scenes(worldId, worldContext, scale, apiConfig, (event) => {
        if (event.type === 'progress') setProgress({ done: event.done, total: event.total });
        if (event.type === 'error') setErrors((prev) => [...prev, event.message]);
        if (event.type === 'done') sceneSummary = event.summary || {};
      });
    } catch (err) {
      setErrors((prev) => [...prev, `场景生成失败: ${err.message}`]);
    }

    setPhase('done');
    setSummary({ ...npcSummary, ...sceneSummary });
  }

  const phaseLabel = phase === 'npcs' ? '正在生成 NPC…' : phase === 'scenes' ? '正在生成场景…' : phase === 'done' ? '生成完成' : '准备中…';
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-ink/50 mb-6">{phaseLabel}</p>

      {phase !== 'done' && phase !== 'idle' && (
        <div className="mb-6">
          <div className="h-2 bg-ink/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-ink/30 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-ink/40 mt-2">{progress.done} / {progress.total}</p>
        </div>
      )}

      {phase === 'done' && summary && (
        <div className="border border-ink/10 rounded-lg p-5 mb-6">
          <p className="text-xs text-ink/40 uppercase tracking-wider mb-3">生成汇总</p>
          <div className="grid grid-cols-2 gap-2 text-sm text-ink/70">
            {summary.legendary > 0 && <p>传奇 NPC: {summary.legendary}</p>}
            {summary.elite > 0 && <p>精英 NPC: {summary.elite}</p>}
            {summary.normal > 0 && <p>普通 NPC: {summary.normal}</p>}
            {summary.disposable > 0 && <p>无用 NPC: {summary.disposable}</p>}
            {summary.scenes > 0 && <p>场景: {summary.scenes}</p>}
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mb-4 text-xs text-red-500">
          {errors.slice(-3).map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {phase === 'done' && (
        <Button onClick={onComplete}>进入世界</Button>
      )}
    </div>
  );
}
