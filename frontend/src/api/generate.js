import { apiFetch } from './client.js';
import { fetchSSE } from './sse-client.js';

const BASE = '/api/world-sim/generate';

export const generateApi = {
  protagonist: (protagonistBio, worldContext, apiConfig) =>
    apiFetch(`${BASE}/protagonist`, {
      method: 'POST',
      body: JSON.stringify({ protagonistBio, worldContext, apiConfig }),
    }),

  bulkNpcs: (worldId, worldContext, scale, apiConfig, onChunk) =>
    fetchSSE(`${BASE}/bulk-npcs`, { worldId, worldContext, scale, apiConfig }, onChunk),

  scenes: (worldId, worldContext, scale, apiConfig, onChunk, characters = []) =>
    fetchSSE(`${BASE}/scenes`, { worldId, worldContext, scale, apiConfig, characters }, onChunk),
};
