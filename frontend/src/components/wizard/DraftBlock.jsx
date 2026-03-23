import Button from '../ui/Button.jsx';

const FIELD_LABELS = {
  background: '背景',
  geography: '地理',
  rules: '规则',
  description: '描述',
  constraints: '限制',
  notes: '备注',
  summary: '概述',
  name: '名称',
  personality: '性格',
  style: '风格',
  status: '状态',
  relationship_to_player: '与玩家关系',
};

function renderValue(value, depth = 0) {
  if (value === null || value === undefined || value === '') return null;

  if (Array.isArray(value)) {
    return (
      <ul className="space-y-2 mt-1">
        {value.map((item, i) => (
          <li key={i} className="pl-3 border-l border-ink/15">
            {typeof item === 'object' ? renderObject(item, depth + 1) : (
              <span className="text-sm text-ink/70">{item}</span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === 'object') {
    return <div className="mt-1">{renderObject(value, depth + 1)}</div>;
  }

  return <p className="text-sm text-ink/70 leading-relaxed">{String(value)}</p>;
}

function renderObject(obj, depth = 0) {
  return (
    <div className="space-y-3">
      {Object.entries(obj).map(([key, val]) => {
        if (val === null || val === undefined || val === '') return null;
        if (key === 'level') return null; // shown as part of tier header
        const label = FIELD_LABELS[key] || key;
        const isHeader = key === 'name' && depth > 0;
        return (
          <div key={key}>
            {isHeader ? (
              <p className="text-xs font-semibold text-ink/60 uppercase tracking-wide mb-1">
                Lv.{obj.level} · {val}
              </p>
            ) : (
              <>
                <p className="text-xs text-ink/40 uppercase tracking-wider mb-1">{label}</p>
                {renderValue(val, depth)}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Renders one section of an AI-generated draft with a Refine button.
 */
export default function DraftBlock({ title, content, sectionKey, onRefine, loading = false }) {
  return (
    <div className="border border-ink/10 rounded p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs text-ink/40 uppercase tracking-wider">{title}</h3>
        <Button
          variant="ghost"
          className="text-xs"
          onClick={() => onRefine(sectionKey)}
          disabled={loading}
        >
          {loading ? '细化中…' : '细化'}
        </Button>
      </div>
      <div>
        {typeof content === 'object' && content !== null
          ? renderObject(content)
          : <p className="text-sm text-ink/70 leading-relaxed">{String(content ?? '')}</p>
        }
      </div>
    </div>
  );
}
