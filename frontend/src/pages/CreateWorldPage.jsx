import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { randomUUID } from '../lib/uuid.js';
import { worldsApi } from '../api/worlds.js';
import DraftBlock from '../components/wizard/DraftBlock.jsx';
import RefineDialog from '../components/wizard/RefineDialog.jsx';
import Button from '../components/ui/Button.jsx';

const SECTION_LABELS = {
  foundation: '基础设定',
  power_system: '力量体系',
  current_state: '当前状态',
};

export default function CreateWorldPage() {
  const navigate = useNavigate();
  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [refiningSection, setRefiningSection] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Always-fresh ref to draft — prevents stale closure in handleRefineConfirm
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  async function handleGenerate() {
    if (!description.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const { draft: d } = await worldsApi.generateDraft(description);
      setDraft(d);
    } catch (err) {
      setError(err?.status === 502 ? 'AI 服务暂时不可用，请稍后重试' : '生成失败，请重试');
    } finally {
      setGenerating(false);
    }
  }

  const handleRefineConfirm = useCallback(async (additionalDescription) => {
    const section = refiningSection;
    const currentDraft = draftRef.current; // always-fresh value via ref
    setRefiningSection(null);
    setDraft((prev) => ({ ...prev, _refining: section }));
    try {
      const { draft: refined } = await worldsApi.refineDraft(currentDraft, section, additionalDescription);
      setDraft(refined);
    } catch {
      setError('细化失败，请重试');
      setDraft((prev) => { const d = { ...prev }; delete d._refining; return d; });
    }
  }, [refiningSection]); // draft removed from deps — ref handles freshness

  async function handleCreate() {
    if (!draft || saving) return; // guard against double-submit
    setSaving(true);
    try {
      const { _refining, ...cleanDraft } = draft;
      const worldToSave = { ...cleanDraft, id: cleanDraft.id || randomUUID(), created_at: new Date().toISOString() };
      await worldsApi.create(worldToSave);
      setSaving(false);
      navigate(`/world/${worldToSave.id}`);
    } catch {
      setError('保存失败，请重试');
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-parchment">
      <header className="border-b border-ink/10 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/')} className="text-ink/50 hover:text-ink text-sm">← 返回</button>
        <h1 className="text-lg font-bold text-ink">创建新世界</h1>
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
              <span className="text-ink font-medium">描述你的世界</span>
              <p className="text-sm text-ink/50 mt-1">自由描述即可，AI 会帮你整理成完整的世界设定</p>
              <textarea
                className="mt-2 w-full border border-ink/20 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ink/30 bg-white"
                rows={6}
                placeholder="描述你想要的世界…例如：一个以蒸汽动力为主的工业城邦，贫富差距极大，底层工人正在酝酿革命…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <Button onClick={handleGenerate} disabled={generating || !description.trim()}>
              {generating ? '生成中…' : '生成世界'}
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
