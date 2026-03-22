import { useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore.js';
import Button from '../components/ui/Button.jsx';

export default function SettingsPage() {
  const { apiUrl, apiKey, model, tokenBudget, save } = useSettingsStore();
  const [form, setForm] = useState({ apiUrl, apiKey, model, tokenBudget });
  const [saved, setSaved] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: name === 'tokenBudget' ? Number(value) : value }));
    setSaved(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    save(form);
    setSaved(true);
  }

  return (
    <div className="min-h-screen bg-parchment">
      <main className="max-w-md mx-auto px-6 py-10">
        <h1 className="text-lg font-medium text-ink mb-8">设置</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <label className="block">
            <span className="text-xs text-ink/40 uppercase tracking-wider mb-1 block">API URL</span>
            <input
              name="apiUrl"
              value={form.apiUrl}
              onChange={handleChange}
              className="w-full bg-transparent border-b border-ink/15 focus:border-ink/40 focus:outline-none text-sm py-1.5 text-ink"
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink/40 uppercase tracking-wider mb-1 block">API Key</span>
            <input
              type="password"
              name="apiKey"
              value={form.apiKey}
              onChange={handleChange}
              autoComplete="new-password"
              className="w-full bg-transparent border-b border-ink/15 focus:border-ink/40 focus:outline-none text-sm py-1.5 text-ink"
              placeholder="sk-..."
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink/40 uppercase tracking-wider mb-1 block">模型</span>
            <input
              name="model"
              value={form.model}
              onChange={handleChange}
              className="w-full bg-transparent border-b border-ink/15 focus:border-ink/40 focus:outline-none text-sm py-1.5 text-ink"
              placeholder="gpt-4o"
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink/40 uppercase tracking-wider mb-1 block">Token 预算</span>
            <input
              type="number"
              name="tokenBudget"
              value={form.tokenBudget}
              onChange={handleChange}
              className="w-full bg-transparent border-b border-ink/15 focus:border-ink/40 focus:outline-none text-sm py-1.5 text-ink"
              min={1024}
              max={128000}
            />
          </label>
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit">保存</Button>
            {saved && <span className="text-xs text-ink/40">已保存</span>}
          </div>
        </form>
      </main>
    </div>
  );
}
