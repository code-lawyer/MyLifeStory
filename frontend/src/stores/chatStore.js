import { create } from 'zustand';

export const useChatStore = create((set) => ({
  messages: [],
  streaming: false,
  setMessages: (msgsOrUpdater) => set((s) => ({
    messages: typeof msgsOrUpdater === 'function' ? msgsOrUpdater(s.messages) : msgsOrUpdater,
  })),
  setStreaming: (streaming) => set({ streaming }),
  clearMessages: () => set({ messages: [] }),
}));
