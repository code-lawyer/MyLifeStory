import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../stores/settingsStore.js';
import Button from '../components/ui/Button.jsx';

const FIELD_ROWS = [
  {
    name: 'apiUrl',
    label: 'API URL',
    type: 'text',
    placeholder: 'https://api.openai.com/v1',
    hint: 'OpenAI 兼容接口的 base URL',
  },
  {
    name: 'apiKey',
    label: 'API Key',
    type: 'password',
    placeholder: 'sk-...',
    hint: '密钥不会上传至任何服务器，仅存储在本地浏览器',
    autoComplete: 'new-password',
  },
  {
    name: 'model',
    label: '模型',
    type: 'text',
    placeholder: 'gpt-4o',
    hint: '用于生成和对话的模型 ID',
  },
];

async function testApiConnection({ apiUrl, apiKey, model }) {
  const res = await fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 5,
      messages: [{ role: 'user', content: 'Hi' }],
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message || body?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (content == null) throw new Error('响应格式异常，未返回内容');
  return true;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { apiUrl, apiKey, model, tokenBudget, save } = useSettingsStore();
  const [form, setForm] = useState({ apiUrl, apiKey, model, tokenBudget });
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | { ok: bool, msg: string }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: name === 'tokenBudget' ? Number(value) : value }));
    setSaved(false);
    setTestResult(null);
  }

  function handleSubmit(e) {
    e.preventDefault();
    save(form);
    setSaved(true);
  }

  async function handleTest() {
    if (!form.apiUrl || !form.apiKey || !form.model) {
      setTestResult({ ok: false, msg: '请先填写 API URL、API Key 和模型名称' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      await testApiConnection(form);
      setTestResult({ ok: true, msg: '连接成功，API 配置有效' });
    } catch (err) {
      setTestResult({ ok: false, msg: err.message || '连接失败' });
    } finally {
      setTesting(false);
    }
  }

  const canTest = !!(form.apiUrl && form.apiKey && form.model);

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
          <h1 className="text-base font-semibold text-ink">设置</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-10 py-10">
        <div className="max-w-xl">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* API 配置 */}
            <section>
              <h2 className="text-xs font-semibold text-ink/40 uppercase tracking-wider mb-5">AI 接口配置</h2>
              <div className="space-y-5">
                {FIELD_ROWS.map((field) => (
                  <label key={field.name} className="block">
                    <span className="text-sm font-medium text-ink/70 block mb-1">{field.label}</span>
                    {field.hint && (
                      <span className="text-xs text-ink/35 block mb-2">{field.hint}</span>
                    )}
                    <input
                      name={field.name}
                      type={field.type}
                      value={form[field.name]}
                      onChange={handleChange}
                      autoComplete={field.autoComplete}
                      className="w-full bg-white/60 border border-ink/12 rounded-lg focus:border-ink/30 focus:outline-none text-sm px-3 py-2.5 text-ink"
                      placeholder={field.placeholder}
                    />
                  </label>
                ))}
              </div>

              {/* 测试连接 */}
              <div className="mt-5 p-4 border border-ink/8 rounded-lg bg-white/30">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-ink/70">测试 API 连接</p>
                    <p className="text-xs text-ink/40 mt-0.5">发送一条极短消息验证配置是否正确</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing || !canTest}
                    className="shrink-0 text-sm px-4 py-2 rounded-lg border border-ink/15 text-ink/60 hover:text-ink/90 hover:border-ink/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {testing ? '测试中…' : '测试连接'}
                  </button>
                </div>

                {testResult && (
                  <div className={`mt-3 px-3 py-2.5 rounded-lg text-sm ${testResult.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                    {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
                  </div>
                )}
              </div>
            </section>

            {/* 高级配置 */}
            <section>
              <h2 className="text-xs font-semibold text-ink/40 uppercase tracking-wider mb-5">高级配置</h2>
              <label className="block">
                <span className="text-sm font-medium text-ink/70 block mb-1">Token 预算</span>
                <span className="text-xs text-ink/35 block mb-2">每次对话最多使用的 token 数量（1024 – 128000）</span>
                <input
                  type="number"
                  name="tokenBudget"
                  value={form.tokenBudget}
                  onChange={handleChange}
                  className="w-48 bg-white/60 border border-ink/12 rounded-lg focus:border-ink/30 focus:outline-none text-sm px-3 py-2.5 text-ink"
                  min={1024}
                  max={128000}
                />
              </label>
            </section>

            <div className="flex items-center gap-4 pt-2">
              <Button type="submit">保存设置</Button>
              {saved && <span className="text-sm text-ink/40">已保存 ✓</span>}
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
