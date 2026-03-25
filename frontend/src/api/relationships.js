import { apiFetch } from './client.js';

const BASE = '/api/world-sim/relationships';

export const relationshipsApi = {
  get: (worldId) => apiFetch(`${BASE}/${worldId}`),

  evaluate: (worldId, charId, messages, apiConfig) =>
    apiFetch(`${BASE}/${worldId}/${charId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ messages, apiConfig }),
    }),

  eventDrift: (worldId, event, affectedCharIds, apiConfig) =>
    apiFetch(`${BASE}/${worldId}/event-drift`, {
      method: 'POST',
      body: JSON.stringify({ event, affectedCharIds, apiConfig }),
    }),
};
