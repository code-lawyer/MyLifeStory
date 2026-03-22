import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { worldsApi } from '../api/worlds.js';
import useDraftWizard from '../hooks/useDraftWizard.js';
import DraftBlock from '../components/wizard/DraftBlock.jsx';
import RefineDialog from '../components/wizard/RefineDialog.jsx';
import ScaleSelector from '../components/wizard/ScaleSelector.jsx';
import Button from '../components/ui/Button.jsx';

const SECTION_LABELS = {
  foundation: '基础设定',
  power_system: '力量体系',
  current_state: '当前状态',
};

export default function CreateWorldPage() {
  const navigate = useNavigate();
  const [scale, setScale] = useState('medium');

  const {
    description, setDescription,
    draft, setDraft,
    generating, saving,
    refiningSection, setRefiningSection,
    error,
    handleGenerate, handleRefineConfirm, handleCreate,
  } = useDraftWizard({
    generateFn: (desc, apiConfig) => worldsApi.generateDraft(desc, apiConfig, scale),
    refineFn: (d, section, text, apiConfig) => worldsApi.refineDraft(d, section, text, apiConfig),
    saveFn: async (cleanDraft, description) => {
      const worldToSave = {
        ...cleanDraft,
        id: cleanDraft.id || crypto.randomUUID(),
        name: description,
        scale,
        onboarding_complete: false,
        created_at: new Date().toISOString(),
      };
      await worldsApi.create(worldToSave);
      return `/world/${worldToSave.id}/setup`;
    },
  });

  return (
    <div className="min-h-screen bg-parchment">
      {/* Top navigation */}
      <header className="border-b border-ink/8 px-10 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-ink/40 hover:text-ink/70 transition-colors"
          >
            ← 返回
          </button>
          <h1 className="text-base font-semibold text-ink">创建新世界</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-10 py-10">
        {error && (
          <div role="alert" className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
            {error.includes('设置') && (
              <button
                onClick={() => navigate('/settings')}
                className="text-xs text-red-600 underline mt-1"
              >
                前往设置 →
              </button>
            )}
          </div>
        )}

        {!draft ? (
          /* Input step — centered, comfortable width */
          <div className="max-w-2xl">
            <p className="text-sm text-ink/50 mb-6 leading-relaxed">
              用自己的语言描述世界的背景、规则或氛围，AI 会帮你整理成完整的世界设定。
            </p>
            <label className="block mb-5">
              <span className="text-xs text-ink/40 uppercase tracking-wider block mb-2">世界规模</span>
              <ScaleSelector value={scale} onChange={setScale} />
            </label>
            <label className="block mb-5">
              <span className="text-xs text-ink/40 uppercase tracking-wider block mb-2">描述你的世界</span>
              <textarea
                className="w-full bg-white/60 border border-ink/12 rounded-lg focus:border-ink/30 focus:outline-none text-sm p-4 resize-none leading-relaxed"
                rows={8}
                placeholder="例如：一个以蒸汽动力为主的工业城邦，贫富差距极大，底层工人正在酝酿革命……"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <Button onClick={handleGenerate} disabled={generating || !description.trim()}>
              {generating ? '生成中…' : '生成世界'}
            </Button>
          </div>
        ) : (
          /* Draft step — three columns on wide screens */
          <div>
            <p className="text-xs text-ink/40 mb-6">对任意区块点击「细化」可以追加描述，让 AI 重新调整该部分</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
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
            </div>
            <div className="flex gap-3">
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? '保存中…' : '确认创建'}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>重新生成</Button>
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
