import { useState } from 'react';
import Button from '../ui/Button.jsx';

/**
 * Modal dialog for entering additional description to refine a draft section.
 * @param {string} sectionTitle - Name of section being refined
 * @param {function} onConfirm - Called with the text when confirmed
 * @param {function} onCancel - Called when dialog is dismissed
 */
export default function RefineDialog({ sectionTitle, onConfirm, onCancel }) {
  const [text, setText] = useState('');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-bold text-ink mb-1">细化：{sectionTitle}</h2>
        <p className="text-sm text-ink/50 mb-3">告诉 AI 你想如何调整这一部分</p>
        <textarea
          className="w-full border border-ink/20 rounded-md p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ink/30"
          rows={4}
          placeholder="例如：让这个世界更加黑暗压抑，增加工业污染的描写…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="secondary" onClick={onCancel}>取消</Button>
          <Button onClick={() => onConfirm(text)} disabled={!text.trim()}>确认细化</Button>
        </div>
      </div>
    </div>
  );
}
