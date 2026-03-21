import { create } from 'zustand';

export const useEventStore = create((set, get) => ({
  events: [],
  pendingProposal: null,
  proposing: false,
  turnsSinceLastPropose: 0,

  setEvents: (events) => set({ events }),
  incrementTurns: () => set((s) => ({ turnsSinceLastPropose: s.turnsSinceLastPropose + 1 })),
  setPendingProposal: (proposal) => set({ pendingProposal: proposal, turnsSinceLastPropose: 0 }),
  clearProposal: () => set({ pendingProposal: null }),
  setProposing: (proposing) => set({ proposing }),

  shouldPropose: () => {
    const { turnsSinceLastPropose, proposing, pendingProposal } = get();
    return turnsSinceLastPropose >= 3 && !proposing && !pendingProposal;
  },
}));
