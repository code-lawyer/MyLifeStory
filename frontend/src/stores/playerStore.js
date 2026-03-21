import { create } from 'zustand';

export const usePlayerStore = create((set) => ({
  player: null,
  setPlayer: (player) => set({ player }),
  updateStatus: (status) => set((s) => ({ player: s.player ? { ...s.player, status: { ...s.player.status, ...status } } : null })),
}));
