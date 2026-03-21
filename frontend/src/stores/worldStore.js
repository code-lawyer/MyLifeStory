import { create } from 'zustand';

export const useWorldStore = create((set) => ({
  worlds: [],
  currentWorld: null,
  narrativeMode: 'ensemble', // 'intimate' | 'ensemble' | 'epic'
  loading: false,
  error: null,
  setWorlds: (worlds) => set({ worlds }),
  setCurrentWorld: (world) => set({ currentWorld: world }),
  setNarrativeMode: (mode) => set({ narrativeMode: mode }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
