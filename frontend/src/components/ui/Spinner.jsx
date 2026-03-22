export default function Spinner({ size = 'md' }) {
  const s = size === 'sm' ? 'w-4 h-4 border-2' : 'w-6 h-6 border-2';
  return (
    <div role="status" aria-label="加载中" className="flex justify-center py-4">
      <div className={`${s} border-ink/10 border-t-ink/50 rounded-full animate-spin`} />
    </div>
  );
}
