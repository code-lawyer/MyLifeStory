import { apiFetch } from './client.js';

const BASE = '/api/world-sim';

export const charactersApi = {
  list: (worldId) => apiFetch(worldId ? `${BASE}/characters?worldId=${worldId}` : `${BASE}/characters`),
  get: (id) => apiFetch(`${BASE}/characters/${id}`),
  create: (char) => apiFetch(`${BASE}/characters`, { method: 'POST', body: JSON.stringify(char) }),
  update: (id, char) => apiFetch(`${BASE}/characters/${id}`, { method: 'PUT', body: JSON.stringify(char) }),
  delete: (id) => apiFetch(`${BASE}/characters/${id}`, { method: 'DELETE' }),
  listByWorld: (worldId) => apiFetch(`${BASE}/characters?worldId=${worldId}`),

  generateDraft: (worldId, description, apiConfig) =>
    apiFetch(`${BASE}/generate/character`, { method: 'POST', body: JSON.stringify({ worldId, description, apiConfig }) }),

  refineDraft: (draft, section, additionalDescription, apiConfig) =>
    apiFetch(`${BASE}/generate/character/refine`, {
      method: 'POST',
      body: JSON.stringify({ draft, section, additionalDescription, apiConfig }),
    }),
};
