import { apiFetch } from './client.js';
import { fetchSSE } from './sse-client.js';

const BASE = '/api/world-sim/generate';

export const generateApi = {
  protagonist: (protagonistBio, worldContext, apiConfig) =>
    apiFetch(`${BASE}/protagonist`, {
      method: 'POST',
      body: JSON.stringify({ protagonistBio, worldContext, apiConfig }),
    }),

  bulkNpcs: (worldId, worldContext, scale, apiConfig, onChunk, { signal } = {}) =>
    fetchSSE(`${BASE}/bulk-npcs`, { worldId, worldContext, scale, apiConfig }, onChunk, { signal }),

  scenes: (worldId, worldContext, scale, apiConfig, onChunk, characters = [], { signal } = {}) =>
    fetchSSE(`${BASE}/scenes`, { worldId, worldContext, scale, apiConfig, characters }, onChunk, { signal }),

  worldNpcs: (worldContext, protagonistBio, count, apiConfig) =>
    apiFetch(`${BASE}/world-npcs`, {
      method: 'POST',
      body: JSON.stringify({ worldContext, protagonistBio, count, apiConfig }),
    }),

  refineCharacter: (draft, section, instruction, apiConfig) =>
    apiFetch(`${BASE}/character/refine`, {
      method: 'POST',
      body: JSON.stringify({ draft, section, instruction, apiConfig }),
    }),

  suggestRefine: (draft, section, apiConfig) =>
    apiFetch(`${BASE}/character/suggest-refine`, {
      method: 'POST',
      body: JSON.stringify({ draft, section, apiConfig }),
    }),
};
