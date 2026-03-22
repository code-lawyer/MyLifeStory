import { useState } from 'react';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';

export default function RefineDialog({ sectionTitle, onConfirm, onCancel }) {
  const [text, setText] = useState('');

  return (
    <Modal onBackdropClick={onCancel} className="w-full max-w-md mx-4">
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
    </Modal>
  );
}
