import { apiFetch } from './client.js';

const BASE = '/api/world-sim';

export const worldsApi = {
  list: () => apiFetch(`${BASE}/worlds`),
  get: (id) => apiFetch(`${BASE}/worlds/${id}`),
  create: (world) => apiFetch(`${BASE}/worlds`, { method: 'POST', body: JSON.stringify(world) }),
  update: (id, world) => apiFetch(`${BASE}/worlds/${id}`, { method: 'PUT', body: JSON.stringify(world) }),
  delete: (id) => apiFetch(`${BASE}/worlds/${id}`, { method: 'DELETE' }),

  generateDraft: (description, apiConfig) =>
    apiFetch(`${BASE}/generate/world`, { method: 'POST', body: JSON.stringify({ description, apiConfig }) }),

  refineDraft: (draft, section, instruction, apiConfig) =>
    apiFetch(`${BASE}/generate/world/refine`, {
      method: 'POST',
      body: JSON.stringify({ draft, section, instruction, apiConfig }),
    }),
};
