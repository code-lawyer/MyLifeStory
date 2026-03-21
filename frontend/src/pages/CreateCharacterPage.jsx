import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { randomUUID } from '../lib/uuid.js';
import { charactersApi } from '../api/characters.js';
import DraftBlock from '../components/wizard/DraftBlock.jsx';
import RefineDialog from '../components/wizard/RefineDialog.jsx';
import Button from '../components/ui/Button.jsx';

const SECTION_LABELS = {
  identity: '基本身份',
  power_tier: '力量等级',
  current_state: '当前状态',
};

export default function CreateCharacterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const worldId = searchParams.get('worldId');

  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [refiningSection, setRefiningSection] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  async function handleGenerate() {
    if (!description.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const { draft: d } = await charactersApi.generateDraft(worldId, description);
      setDraft(d);
    } catch (err) {
      setError(err?.status === 502 ? 'AI 服务暂时不可用，请稍后重试' : '生成失败，请重试');
    } finally {
      setGenerating(false);
    }
  }

  const handleRefineConfirm = useCallback(async (additionalDescription) => {
    const section = refiningSection;
    const currentDraft = draftRef.current;
    setRefiningSection(null);
    setDraft((prev) => ({ ...prev, _refining: section }));
    try {
      const { draft: refined } = await charactersApi.refineDraft(currentDraft, section, additionalDescription);
      setDraft(refined);
    } catch {
      setError('细化失败，请重试');
      setDraft((prev) => { const d = { ...prev }; delete d._refining; return d; });
    }
  }, [refiningSection]); // draft removed from deps — draftRef handles freshness

  async function handleCreate() {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const { _refining, ...cleanDraft } = draft;
      const charToSave = { ...cleanDraft, id: cleanDraft.id || randomUUID(), world_id: worldId, created_at: new Date().toISOString() };
      await charactersApi.create(charToSave);
      setSaving(false);
      navigate(worldId ? `/world/${worldId}` : '/');
    } catch {
      setError('保存失败，请重试');
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-parchment">
      <header className="border-b border-ink/10 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate(worldId ? `/world/${worldId}` : '/')} className="text-ink/50 hover:text-ink text-sm">← 返回</button>
        <h1 className="text-lg font-bold text-ink">创建角色</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {!draft ? (
          <div className="space-y-4">
            <label className="block">
              <span className="text-ink font-medium">描述这个角色</span>
              <p className="text-sm text-ink/50 mt-1">AI 会参考当前世界的力量体系为角色分配合适的等级</p>
              <textarea
                className="mt-2 w-full border border-ink/20 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ink/30 bg-white"
                rows={5}
                placeholder="描述这个角色的概念、性格、背景…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <Button onClick={handleGenerate} disabled={generating || !description.trim()}>
              {generating ? '生成中…' : '生成角色'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink/50">对任意区块点击「细化」可以追加描述，让 AI 重新调整该部分</p>
            {Object.entries(SECTION_LABELS).map(([key, label]) => (
              <DraftBlock
                key={key}
                title={label}
                content={draft[key]}
                sectionKey={key}
                onRefine={setRefiningSection}
                loading={draft._refining === key}
              />
            ))}
            <div className="flex gap-3 pt-2">
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? '保存中…' : '确认创建'}
              </Button>
              <Button variant="secondary" onClick={() => setDraft(null)}>重新生成</Button>
            </div>
          </div>
        )}
      </main>

      {refiningSection && (
        <RefineDialog
          sectionTitle={SECTION_LABELS[refiningSection]}
          onConfirm={handleRefineConfirm}
          onCancel={() => setRefiningSection(null)}
        />
      )}
    </div>
  );
}
