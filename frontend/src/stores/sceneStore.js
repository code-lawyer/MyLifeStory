import { create } from 'zustand';

export const useSceneStore = create((set) => ({
  scenes: [],
  currentScene: null,
  setScenes: (scenes) => set({ scenes }),
  setCurrentScene: (scene) => set({ currentScene: scene }),
}));
