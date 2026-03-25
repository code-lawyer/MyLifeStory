import { create } from 'zustand';

export const useChatStore = create((set, get) => ({
  blocks: [],       // [{ id, characterId, characterName, messages: [{ role, content, error? }] }]
  streaming: false,

  ensureBlock(characterId, characterName) {
    const { blocks } = get();
    const last = blocks[blocks.length - 1];
    if (last && last.characterId === characterId) return last.id;
    const id = crypto.randomUUID();
    set({ blocks: [...blocks, { id, characterId, characterName, messages: [] }] });
    return id;
  },

  addMessage(blockId, msg) {
    set((s) => ({
      blocks: s.blocks.map(b =>
        b.id === blockId ? { ...b, messages: [...b.messages, msg] } : b
      ),
    }));
  },

  updateLastMessage(blockId, content) {
    set((s) => ({
      blocks: s.blocks.map(b => {
        if (b.id !== blockId) return b;
        const msgs = [...b.messages];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content };
        return { ...b, messages: msgs };
      }),
    }));
  },

  addSystemMessage(text) {
    const id = crypto.randomUUID();
    set((s) => ({
      blocks: [...s.blocks, { id, characterId: '__system__', characterName: null, messages: [{ role: 'assistant', content: text }] }],
    }));
  },

  getAllMessages() {
    return get().blocks.flatMap(b => b.messages);
  },

  getCharacterMessages(characterId) {
    return get().blocks
      .filter(b => b.characterId === characterId)
      .flatMap(b => b.messages);
  },

  setStreaming: (streaming) => set({ streaming }),
  clearBlocks: () => set({ blocks: [], streaming: false }),
  setBlocks: (blocks) => set({ blocks }),
}));
