import { useState } from 'react';
import { scenesApi } from '../../api/scenes.js';
import Modal from '../ui/Modal.jsx';

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
    <Modal>
      <h2 className="text-sm font-medium text-ink/80 mb-1">创建起始场景</h2>
      <p className="text-xs text-ink/40 mb-4">这个世界还没有任何场景，先创建一个起点吧。</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink/50">场景名</span>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setError(false); }}
            className="border-b border-ink/15 bg-transparent px-1 py-1.5 text-ink/80 focus:border-ink/40 focus:outline-none"
            placeholder="例：起始酒馆"
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink/50">描述（可选）</span>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="border-b border-ink/15 bg-transparent px-1 py-1.5 text-ink/80 resize-none focus:border-ink/40 focus:outline-none"
            placeholder="场景简短描述…"
          />
        </label>
        {error && <p role="alert" className="text-xs text-ink/40">创建失败，请重试</p>}
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="mt-1 py-1.5 text-sm bg-ink text-parchment rounded disabled:opacity-50"
        >
          创建场景
        </button>
      </form>
    </Modal>
  );
}
