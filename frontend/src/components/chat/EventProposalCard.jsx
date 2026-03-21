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
    <div className="mx-3 mb-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm shadow">
      <p className="text-amber-800 italic mb-3">{proposal.narrative}</p>
      <p className="font-semibold text-gray-800 mb-1">{proposal.event_draft.title}</p>
      <p className="text-gray-600 text-xs mb-3">{proposal.event_draft.description}</p>
      <div className="flex gap-2 justify-end">
        <button
          className="px-3 py-1 rounded border text-sm disabled:opacity-50"
          onClick={onDismiss}
          disabled={accepting}
        >
          忽略
        </button>
        <button
          className="px-3 py-1 rounded bg-amber-500 text-white text-sm disabled:opacity-50"
          onClick={handleAccept}
          disabled={accepting}
        >
          接受
        </button>
      </div>
    </div>
  );
}
