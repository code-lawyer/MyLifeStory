import { apiFetch } from './client.js';

const BASE = '/api/world-sim';

export const worldsApi = {
  list: () => apiFetch(`${BASE}/worlds`),
  get: (id) => apiFetch(`${BASE}/worlds/${id}`),
  create: (world) => apiFetch(`${BASE}/worlds`, { method: 'POST', body: JSON.stringify(world) }),
  update: (id, world) => apiFetch(`${BASE}/worlds/${id}`, { method: 'PUT', body: JSON.stringify(world) }),
  delete: (id) => apiFetch(`${BASE}/worlds/${id}`, { method: 'DELETE' }),

  exportWorld: (worldId) => apiFetch(`${BASE}/worlds/${worldId}/export`),
  importWorld: (bundle) => apiFetch(`${BASE}/worlds/import`, { method: 'POST', body: JSON.stringify(bundle) }),

  generateDraft: (description, apiConfig, scale) =>
    apiFetch(`${BASE}/generate/world`, { method: 'POST', body: JSON.stringify({ description, apiConfig, scale }) }),

  refineDraft: (draft, section, instruction, apiConfig) =>
    apiFetch(`${BASE}/generate/world/refine`, {
      method: 'POST',
      body: JSON.stringify({ draft, section, instruction, apiConfig }),
    }),

  narrate: (worldId, event, apiConfig) =>
    apiFetch(`${BASE}/worlds/${worldId}/narrate`, {
      method: 'POST',
      body: JSON.stringify({ event, apiConfig }),
    }),
};
