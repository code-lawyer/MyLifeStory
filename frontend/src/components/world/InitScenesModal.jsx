import { useState } from 'react';
import { scenesApi } from '../../api/scenes.js';

export default function InitScenesModal({ worldId, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      const scene = await scenesApi.create(worldId, {
        id: crypto.randomUUID(),
        name: name.trim(),
        description: description.trim(),
        is_locked: false,
        characters_present: [],
      });
      onCreated(scene);
    } catch {
      setError(true);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
        <h2 className="text-lg font-semibold mb-1">创建起始场景</h2>
        <p className="text-sm text-gray-500 mb-4">这个世界还没有任何场景，先创建一个起点吧。</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>场景名</span>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setError(false); }}
              className="border rounded px-3 py-2"
              placeholder="例：起始酒馆"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>描述（可选）</span>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="border rounded px-3 py-2 resize-none"
              placeholder="场景简短描述…"
            />
          </label>
          {error && <p role="alert" className="text-sm text-red-600">创建失败，请重试</p>}
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            创建场景
          </button>
        </form>
      </div>
    </div>
  );
}
