import { create } from 'zustand';

export const useChatStore = create((set) => ({
  messages: [],
  streaming: false,
  currentWorldId: null,
  setMessages: (messages) => set({ messages }),
  appendMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setStreaming: (streaming) => set({ streaming }),
  setCurrentWorldId: (id) => set({ currentWorldId: id }),
  clearMessages: () => set({ messages: [] }),
}));
