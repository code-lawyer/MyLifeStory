import { useState } from 'react';
import { eventsApi } from '../../api/events.js';

export default function EventProposalCard({ worldId, proposal, onDismiss }) {
  const [accepting, setAccepting] = useState(false);

  async function handleAccept() {
    setAccepting(true);
    try {
      await eventsApi.confirm(worldId, proposal.event_draft);
      onDismiss();
    } catch {
      setAccepting(false);
    }
  }

  return (
    <div className="mx-3 mb-2 rounded border border-ink/10 bg-parchment p-3 text-sm">
      <p className="text-ink/70 italic mb-3">{proposal.narrative}</p>
      <p className="font-medium text-ink/80 mb-1">{proposal.event_draft.title}</p>
      <p className="text-ink/50 text-xs mb-3">{proposal.event_draft.description}</p>
      <div className="flex gap-3 justify-end">
        <button
          className="text-xs text-ink/40 hover:text-ink/70 disabled:opacity-50"
          onClick={onDismiss}
          disabled={accepting}
        >
          忽略
        </button>
        <button
          className="text-xs text-ink/60 hover:text-ink font-medium disabled:opacity-50"
          onClick={handleAccept}
          disabled={accepting}
        >
          接受
        </button>
      </div>
    </div>
  );
}
