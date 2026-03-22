import { useState } from 'react';
import { generateApi } from '../../api/generate.js';
import Button from '../ui/Button.jsx';

export default function ProtagonistBioStep({
  bio, onBioChange, playerName, onPlayerNameChange,
  worldContext, apiConfig, onComplete, worldId,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit() {
    if (!bio.trim() || !playerName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await generateApi.protagonist(bio, worldContext, apiConfig);
      const suggestions = result.core_npcs || [];
      onComplete(suggestions);
    } catch {
      setError('分析小传失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-ink/50 mb-6 leading-relaxed">
        写下你的主角小传，AI 会从中提取需要创建的核心人物。
      </p>

      <label className="block mb-5">
        <span className="text-xs text-ink/40 uppercase tracking-wider block mb-2">主角名称</span>
        <input
          type="text"
          className="w-full bg-white/60 border border-ink/12 rounded-lg focus:border-ink/30 focus:outline-none text-sm p-3"
          placeholder="你的角色叫什么名字？"
          value={playerName}
          onChange={(e) => onPlayerNameChange(e.target.value)}
        />
      </label>

      <label className="block mb-5">
        <span className="text-xs text-ink/40 uppercase tracking-wider block mb-2">主角小传</span>
        <textarea
          className="w-full bg-white/60 border border-ink/12 rounded-lg focus:border-ink/30 focus:outline-none text-sm p-4 resize-none leading-relaxed"
          rows={10}
          placeholder="描述你的角色背景、经历、重要的人物关系……AI 会从中提取需要创建的核心人物。"
          value={bio}
          onChange={(e) => onBioChange(e.target.value)}
        />
      </label>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <Button onClick={handleSubmit} disabled={loading || !bio.trim() || !playerName.trim()}>
        {loading ? '分析中…' : '提取核心人物'}
      </Button>
    </div>
  );
}
