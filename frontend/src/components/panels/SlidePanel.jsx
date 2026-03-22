export default function SlidePanel({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} />
      <aside className="relative w-80 bg-parchment h-full border-l border-ink/8 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink/8">
          <h2 className="text-sm font-medium text-ink/80">{title}</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-ink/40 hover:text-ink/70 text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </aside>
    </div>
  );
}
