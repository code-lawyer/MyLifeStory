import { create } from 'zustand';

export const useChatStore = create((set) => ({
  messages: [],
  streaming: false,
  currentWorldId: null,
  setMessages: (msgsOrUpdater) => set((s) => ({
    messages: typeof msgsOrUpdater === 'function' ? msgsOrUpdater(s.messages) : msgsOrUpdater,
  })),
  appendMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setStreaming: (streaming) => set({ streaming }),
  setCurrentWorldId: (id) => set({ currentWorldId: id }),
  clearMessages: () => set({ messages: [] }),
}));
