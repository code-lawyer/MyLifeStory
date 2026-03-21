export default function Spinner() {
  return (
    <div role="status" aria-label="加载中" className="flex justify-center py-8">
      <div className="w-8 h-8 border-4 border-ink/20 border-t-ink rounded-full animate-spin" />
    </div>
  );
}
