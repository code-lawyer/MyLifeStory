import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../stores/settingsStore.js';

/**
 * Shared wizard logic for CreateWorldPage and CreateCharacterPage.
 * @param {function} generateFn - (description, apiConfig) => Promise<{ draft }>
 * @param {function} refineFn - (draft, section, text, apiConfig) => Promise<{ draft }>
 * @param {function} saveFn - (cleanDraft) => Promise<string> — returns redirect path
 */
export default function useDraftWizard({ generateFn, refineFn, saveFn }) {
  const navigate = useNavigate();
  const { getApiConfig } = useSettingsStore();
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
    const cfg = getApiConfig();
    if (!cfg.apiKey || !cfg.apiUrl || !cfg.model) {
      setError('请先前往「设置」填写 API URL、API Key 和模型名称');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const { draft: d } = await generateFn(description, cfg);
      setDraft(d);
    } catch (err) {
      setError(err?.status === 502 ? 'AI 服务暂时不可用，请稍后重试' : '生成失败，请重试');
    } finally {
      setGenerating(false);
    }
  }

  const handleRefineConfirm = useCallback(async (instruction) => {
    const section = refiningSection;
    const currentDraft = draftRef.current;
    setRefiningSection(null);
    setDraft((prev) => ({ ...prev, _refining: section }));
    try {
      const { draft: refined } = await refineFn(currentDraft, section, instruction, getApiConfig());
      setDraft(refined);
    } catch {
      setError('细化失败，请重试');
      setDraft((prev) => { const d = { ...prev }; delete d._refining; return d; });
    }
  }, [refiningSection]);

  async function handleCreate() {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const { _refining, ...cleanDraft } = draft;
      const redirectPath = await saveFn(cleanDraft, description);
      setSaving(false);
      navigate(redirectPath);
    } catch {
      setError('保存失败，请重试');
      setSaving(false);
    }
  }

  return {
    description, setDescription,
    draft, setDraft,
    generating, saving,
    refiningSection, setRefiningSection,
    error,
    handleGenerate, handleRefineConfirm, handleCreate,
  };
}
