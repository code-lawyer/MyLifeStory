import { useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore.js';
import Button from './ui/Button.jsx';

export default function ApiSetupGuard({ children }) {
  const apiKey = useSettingsStore(s => s.apiKey);
  const [dismissed, setDismissed] = useState(false);

  const needsSetup = !apiKey && !dismissed;

  if (!needsSetup) return children;

  return (
    <>
      {children}
      <ApiSetupOverlay onDone={() => setDismissed(true)} />
    </>
  );
}

function ApiSetupOverlay({ onDone }) {
  const { save } = useSettingsStore();
  const [form, setForm] = useState({ apiUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o' });
  const [status, setStatus] = useState(null); // null | 'testing' | 'ok' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function testAndSave() {
    if (!form.apiUrl || !form.apiKey || !form.model) {
      setStatus('error');
      setErrorMsg('请填写所有字段');
      return;
    }
    setStatus('testing');
    try {
      const res = await fetch(`${form.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${form.apiKey}`,
        },
        body: JSON.stringify({
          model: form.model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      save(form);
      setStatus('ok');
      setTimeout(onDone, 400);
    } catch (err) {
      setStatus('error');
      setErrorMsg(`连接失败：${err.message}`);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="api-setup-title" className="bg-parchment border border-ink/20 rounded-xl shadow-2xl p-8 w-full max-w-md mx-4 space-y-5">
        <div>
          <h2 id="api-setup-title" className="text-lg font-semibold text-ink">连接 AI 接口</h2>
          <p className="text-sm text-ink/60 mt-1">首次使用需要配置 LLM API，应用的所有 AI 功能都依赖它。</p>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-ink/50 uppercase tracking-wider">API 地址</span>
            <input
              className="mt-1 w-full px-3 py-2 text-sm bg-white/60 border border-ink/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-ink/40"
              value={form.apiUrl}
              onChange={e => set('apiUrl', e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink/50 uppercase tracking-wider">API Key</span>
            <input
              type="password"
              className="mt-1 w-full px-3 py-2 text-sm bg-white/60 border border-ink/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-ink/40"
              value={form.apiKey}
              onChange={e => set('apiKey', e.target.value)}
              placeholder="sk-..."
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink/50 uppercase tracking-wider">模型</span>
            <input
              className="mt-1 w-full px-3 py-2 text-sm bg-white/60 border border-ink/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-ink/40"
              value={form.model}
              onChange={e => set('model', e.target.value)}
              placeholder="gpt-4o"
            />
          </label>
        </div>

        {status === 'error' && (
          <p className="text-xs text-red-500">{errorMsg}</p>
        )}
        {status === 'ok' && (
          <p className="text-xs text-green-600">连接成功，正在进入…</p>
        )}

        <div className="flex gap-3 pt-1">
          <Button
            onClick={testAndSave}
            disabled={status === 'testing' || status === 'ok'}
            className="flex-1"
          >
            {status === 'testing' ? '测试中…' : '测试并保存'}
          </Button>
          <Button variant="secondary" onClick={onDone}>跳过</Button>
        </div>
        <p className="text-[11px] text-ink/40 text-center">API Key 仅保存在本机，不会上传。</p>
      </div>
    </div>
  );
}
