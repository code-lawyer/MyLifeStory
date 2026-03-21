import Button from '../ui/Button.jsx';

/**
 * Renders one section of an AI-generated draft with a Refine button.
 * @param {string} title - Section heading
 * @param {any} content - Rendered as JSON or string
 * @param {string} sectionKey - Key passed to onRefine
 * @param {function} onRefine - Called with sectionKey when Refine clicked
 * @param {boolean} loading - Shows disabled state on refine button
 */
export default function DraftBlock({ title, content, sectionKey, onRefine, loading = false }) {
  const display = typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content ?? '');

  return (
    <div className="border border-ink/10 rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-ink">{title}</h3>
        <Button
          variant="ghost"
          className="text-sm"
          onClick={() => onRefine(sectionKey)}
          disabled={loading}
        >
          {loading ? '细化中…' : '细化'}
        </Button>
      </div>
      <pre className="text-sm text-ink/70 whitespace-pre-wrap font-sans">{display}</pre>
    </div>
  );
}
