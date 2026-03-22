export default function Modal({ children, onBackdropClick, className = 'w-80' }) {
  return (
    <div
      className="fixed inset-0 bg-ink/20 flex items-center justify-center z-50"
      onClick={onBackdropClick}
    >
      <div
        className={`bg-parchment rounded p-6 ${className}`}
        onClick={onBackdropClick ? (e) => e.stopPropagation() : undefined}
      >
        {children}
      </div>
    </div>
  );
}
