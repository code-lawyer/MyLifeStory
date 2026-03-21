import { create } from 'zustand';

export const useCharacterStore = create((set) => ({
  characters: [],
  activeCharacters: [],
  setCharacters: (characters) => set({ characters }),
  setActiveCharacters: (activeCharacters) => set({ activeCharacters }),
}));
