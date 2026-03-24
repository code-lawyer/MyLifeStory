import { useState } from 'react';
import { charactersApi } from '../../api/characters.js';
import { generateApi } from '../../api/generate.js';
import { playerApi } from '../../api/player.js';
import Button from '../ui/Button.jsx';
import DraftBlock from '../wizard/DraftBlock.jsx';
import RefineDialog from '../wizard/RefineDialog.jsx';

const SECTION_LABELS = {
  identity: '身份',
  voice: '声线',
  current_state: '状态',
};

export default function CoreNpcStep({
  worldId, worldContext, playerName, protagonistBio,
  protagonistNpcs = [], worldNpcs = [], apiConfig, onComplete,
}) {
  const allSuggestions = [
    ...protagonistNpcs.map(s => ({ ...s, source: 'protagonist' })),
    ...worldNpcs.map(s => ({ ...s, source: 'world' })),
  ];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [draft, setDraft] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdNpcs, setCreatedNpcs] = useState([]);
  const [error, setError] = useState(null);
  const [refiningSection, setRefiningSection] = useState(null);
  const [refineSuggestions, setRefineSuggestions] = useState({});

  const current = allSuggestions[currentIndex];
  const isLast = currentIndex >= allSuggestions.length - 1;

  const prevSource = currentIndex > 0 ? allSuggestions[currentIndex - 1]?.source : null;
  const showGroupHeader = current && current.source !== prevSource;

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
      const { refine_suggestions, ...cleanDraft } = d || {};
      if (refine_suggestions) {
        setRefineSuggestions(refine_suggestions);
      }
      setDraft(cleanDraft);
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
      await charactersApi.create({ ...char, protagonistBio, apiConfig });
      const updatedNpcs = [...createdNpcs, char];
      setCreatedNpcs(updatedNpcs);
      advance(updatedNpcs);
    } catch {
      setError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  function handleSkip() {
    advance(createdNpcs);
  }

  // Refine handlers
  async function handleRefineConfirm(instruction) {
    const section = refiningSection;
    setRefiningSection(null);
    setDraft(prev => ({ ...prev, _refining: section }));
    try {
      const { draft: refined } = await generateApi.refineCharacter(draft, section, instruction, apiConfig);
      setDraft(refined);
    } catch {
      setError('细化失败，请重试');
      setDraft(prev => { const { _refining, ...d } = prev || {}; return d; });
    }
  }

  async function handleRefreshSuggestions() {
    if (!refiningSection || !draft) return;
    try {
      const { suggestions } = await generateApi.suggestRefine(draft, refiningSection, apiConfig);
      setRefineSuggestions(prev => ({ ...prev, [refiningSection]: suggestions }));
    } catch { /* silent */ }
  }

  async function createPlayer() {
    try {
      await playerApi.create(worldId, {
        id: crypto.randomUUID(),
        world_id: worldId,
        name: playerName,
        status: { health: 100, mental: 100, reputation: 0, current_location: null },
        inventory: [],
      });
    } catch (err) {
      console.warn('Player creation failed (may already exist):', err.message);
    }
  }

  async function advance(currentNpcs) {
    setDraft(null);
    setError(null);
    setRefineSuggestions({});
    if (isLast) {
      await createPlayer();
      onComplete(currentNpcs);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  if (allSuggestions.length === 0) {
    return (
      <div className="max-w-2xl">
        <p className="text-sm text-ink/50 mb-6">AI 未识别出核心人物，直接进入下一步。</p>
        <Button onClick={async () => {
          await createPlayer();
          onComplete([]);
        }}>继续</Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      {/* Group header */}
      {showGroupHeader && (
        <p className="text-xs text-ink/30 uppercase tracking-wider mb-3 mt-2">
          {current.source === 'protagonist' ? '小传中的核心人物' : '世界中的重要人物'}
        </p>
      )}

      <p className="text-xs text-ink/40 mb-4">
        核心人物 {currentIndex + 1} / {allSuggestions.length}：{current.name}（{current.relationship}）
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
                <DraftBlock key={key} title={label} content={draft[key]} sectionKey={key} onRefine={() => setRefiningSection(key)} />
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

      {/* Refine dialog */}
      {refiningSection && (
        <RefineDialog
          section={SECTION_LABELS[refiningSection]}
          suggestions={refineSuggestions[refiningSection] || []}
          onConfirm={handleRefineConfirm}
          onCancel={() => setRefiningSection(null)}
          onRefreshSuggestions={handleRefreshSuggestions}
        />
      )}
    </div>
  );
}
