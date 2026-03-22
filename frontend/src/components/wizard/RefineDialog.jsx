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
    <div className="fixed inset-0 bg-ink/20 flex items-center justify-center z-50" onClick={onCancel}>
      <div
        className="bg-parchment rounded p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-medium text-ink mb-1">细化：{sectionTitle}</h2>
        <p className="text-xs text-ink/40 mb-3">告诉 AI 你想如何调整这一部分</p>
        <textarea
          className="w-full bg-transparent border border-ink/10 rounded focus:border-ink/20 focus:outline-none text-sm p-3 resize-none"
          rows={4}
          placeholder="例如：让这个世界更加黑暗压抑，增加工业污染的描写…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" onClick={onCancel}>取消</Button>
          <Button onClick={() => onConfirm(text)} disabled={!text.trim()}>确认细化</Button>
        </div>
      </div>
    </div>
  );
}
