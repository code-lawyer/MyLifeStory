import { useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore.js';

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
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-xl font-semibold mb-6">设置</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span>API URL</span>
          <input
            name="apiUrl"
            value={form.apiUrl}
            onChange={handleChange}
            className="border rounded px-3 py-2"
            placeholder="https://api.openai.com/v1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>API Key</span>
          <input
            type="password"
            name="apiKey"
            value={form.apiKey}
            onChange={handleChange}
            className="border rounded px-3 py-2"
            placeholder="sk-..."
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>模型</span>
          <input
            name="model"
            value={form.model}
            onChange={handleChange}
            className="border rounded px-3 py-2"
            placeholder="gpt-4o"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Token 预算</span>
          <input
            type="number"
            name="tokenBudget"
            value={form.tokenBudget}
            onChange={handleChange}
            className="border rounded px-3 py-2"
            min={1024}
            max={128000}
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            保存
          </button>
          {saved && <span className="text-sm text-green-600">已保存</span>}
        </div>
      </form>
    </div>
  );
}
