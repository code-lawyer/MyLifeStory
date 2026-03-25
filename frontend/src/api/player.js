import { apiFetch } from './client.js';

const BASE = (worldId) => `/api/world-sim/player/${worldId}`;

export const playerApi = {
    get: (worldId) => apiFetch(BASE(worldId)),
    create: (worldId, player) => apiFetch(BASE(worldId), { method: 'POST', body: JSON.stringify(player) }),
    update: (worldId, player) => apiFetch(BASE(worldId), { method: 'PUT', body: JSON.stringify(player) }),
    updateStatus: (worldId, status) =>
        apiFetch(`${BASE(worldId)}/status`, { method: 'PATCH', body: JSON.stringify(status) }),
    drift: (worldId, event, apiConfig) =>
        apiFetch(`${BASE(worldId)}/drift`, { method: 'POST', body: JSON.stringify({ event, apiConfig }) }),
    addItem: (worldId, item) =>
        apiFetch(`${BASE(worldId)}/inventory`, { method: 'POST', body: JSON.stringify(item) }),
    deleteItem: (worldId, itemId) =>
        apiFetch(`${BASE(worldId)}/inventory/${itemId}`, { method: 'DELETE' }),
};
