import { create } from 'zustand';

const STORAGE_KEY = 'world-sim-settings';

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export const useSettingsStore = create((set, get) => {
  const saved = loadFromLocalStorage();
  return {
    apiUrl: saved.apiUrl || '',
    apiKey: saved.apiKey || '',
    model: saved.model || '',
    tokenBudget: saved.tokenBudget || 4096,

    loadFromStorage: () => {
      const data = loadFromLocalStorage();
      set({
        apiUrl: data.apiUrl || '',
        apiKey: data.apiKey || '',
        model: data.model || '',
        tokenBudget: data.tokenBudget || 4096,
      });
    },

    save: (updates) => {
      const next = { ...get(), ...updates };
      set(updates);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          apiUrl: next.apiUrl,
          apiKey: next.apiKey,
          model: next.model,
          tokenBudget: next.tokenBudget,
        }));
      } catch { /* ignore quota errors */ }
    },

    getApiConfig: () => {
      const { apiUrl, apiKey, model } = get();
      return { apiUrl, apiKey, model };
    },
  };
});
