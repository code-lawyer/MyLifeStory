import { describe, it, expect, beforeEach } from 'vitest';
import { useEventStore } from '../../stores/eventStore.js';

beforeEach(() => {
  useEventStore.setState({ events: [], pendingProposal: null, proposing: false, turnsSinceLastPropose: 0 });
});

describe('eventStore', () => {
  it('incrementTurns increments the counter', () => {
    useEventStore.getState().incrementTurns();
    useEventStore.getState().incrementTurns();
    expect(useEventStore.getState().turnsSinceLastPropose).toBe(2);
  });

  it('setPendingProposal sets the proposal and resets counter', () => {
    useEventStore.getState().incrementTurns();
    useEventStore.getState().incrementTurns();
    useEventStore.getState().incrementTurns();
    useEventStore.getState().setPendingProposal({ narrative: 'Something happened', event_draft: { id: 'e1' } });
    expect(useEventStore.getState().pendingProposal).toBeTruthy();
    expect(useEventStore.getState().turnsSinceLastPropose).toBe(0);
  });

  it('clearProposal removes pending proposal', () => {
    useEventStore.getState().setPendingProposal({ narrative: 'X', event_draft: {} });
    useEventStore.getState().clearProposal();
    expect(useEventStore.getState().pendingProposal).toBeNull();
  });

  it('shouldPropose returns true only when turns >= 3 and not proposing and no pending', () => {
    expect(useEventStore.getState().shouldPropose()).toBe(false);
    useEventStore.setState({ turnsSinceLastPropose: 3 });
    expect(useEventStore.getState().shouldPropose()).toBe(true);
    useEventStore.setState({ proposing: true });
    expect(useEventStore.getState().shouldPropose()).toBe(false);
  });

  it('shouldPropose returns false when a pending proposal exists', () => {
    useEventStore.setState({ turnsSinceLastPropose: 3, proposing: false, pendingProposal: { narrative: 'X', event_draft: {} } });
    expect(useEventStore.getState().shouldPropose()).toBe(false);
  });
});
