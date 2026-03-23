import { useState } from 'react';
import { charactersApi } from '../../api/characters.js';
import { playerApi } from '../../api/player.js';
import Button from '../ui/Button.jsx';
import DraftBlock from '../wizard/DraftBlock.jsx';

const SECTION_LABELS = {
  identity: '身份',
  voice: '声线',
  current_state: '状态',
};

export default function CoreNpcStep({
  suggestions, worldId, worldContext, playerName, protagonistBio, apiConfig, onComplete,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [draft, setDraft] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdNpcs, setCreatedNpcs] = useState([]);
  const [error, setError] = useState(null);

  const current = suggestions[currentIndex];
  const isLast = currentIndex >= suggestions.length - 1;

  async function handleGenerate() {
    if (!current) return;
    setGenerating(true);
    setError(null);
    try {
      const { draft: d } = await charactersApi.generateDraft(
        worldId,
        `Name: ${current.name}, Relationship to protagonist: ${current.relationship}`,
        apiConfig,
        current.suggested_tier,
        current.relationship,
        { worldContext, protagonistBio },
      );
      setDraft(d);
    } catch {
      setError('生成失败，请重试');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      const char = {
        ...draft,
        id: crypto.randomUUID(),
        world_id: worldId,
        tier: current.suggested_tier || 'legendary',
        is_core: true,
        is_template: false,
      };
      await charactersApi.create(char);
      setCreatedNpcs((prev) => [...prev, char]);
      advance();
    } catch {
      setError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  function handleSkip() {
    advance();
  }

  async function advance() {
    setDraft(null);
    setError(null);
    if (isLast) {
      // Create player
      try {
        await playerApi.create(worldId, {
          id: crypto.randomUUID(),
          world_id: worldId,
          name: playerName,
          status: { health: 100, mental: 100, reputation: 0, current_location: null },
          inventory: [],
        });
      } catch { /* player may already exist */ }
      onComplete(createdNpcs);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  if (suggestions.length === 0) {
    return (
      <div className="max-w-2xl">
        <p className="text-sm text-ink/50 mb-6">AI 未从小传中识别出核心人物，直接进入下一步。</p>
        <Button onClick={() => {
          playerApi.create(worldId, {
            id: crypto.randomUUID(), world_id: worldId, name: playerName,
            status: { health: 100, mental: 100, reputation: 0, current_location: null },
            inventory: [],
          }).catch(() => {});
          onComplete([]);
        }}>继续</Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <p className="text-xs text-ink/40 mb-4">
        核心人物 {currentIndex + 1} / {suggestions.length}：{current.name}（{current.relationship}）
      </p>

      {!draft ? (
        <div>
          <div className="border border-ink/10 rounded-lg p-5 mb-5">
            <p className="text-sm text-ink"><strong>{current.name}</strong> — {current.relationship}</p>
            <p className="text-xs text-ink/40 mt-1">建议等级：{current.suggested_tier}</p>
          </div>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <div className="flex gap-3">
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? '生成中…' : 'AI 生成草稿'}
            </Button>
            <Button variant="ghost" onClick={handleSkip}>跳过此人物</Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {Object.entries(SECTION_LABELS).map(([key, label]) => (
              draft[key] ? (
                <DraftBlock key={key} title={label} content={draft[key]} sectionKey={key} onRefine={() => {}} />
              ) : null
            ))}
          </div>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中…' : '确认保存'}
            </Button>
            <Button variant="ghost" onClick={handleSkip}>跳过</Button>
          </div>
        </div>
      )}
    </div>
  );
}
