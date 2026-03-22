import { create } from 'zustand';

export const useWorldStore = create((set) => ({
  narrativeMode: 'ensemble', // 'intimate' | 'ensemble' | 'epic'
  setNarrativeMode: (mode) => set({ narrativeMode: mode }),
}));
