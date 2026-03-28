import { apiFetch } from './client.js';

const BASE = (worldId) => `/api/world-sim/state/${worldId}`;

export const stateApi = {
    get: (worldId) => apiFetch(BASE(worldId)),
    update: (worldId, apiConfig) =>
        apiFetch(`${BASE(worldId)}/update`, {
            method: 'POST',
            body: JSON.stringify({ apiConfig }),
        }),
    tick: (worldId, apiConfig) =>
        apiFetch(`${BASE(worldId)}/tick`, {
            method: 'POST',
            body: JSON.stringify({ apiConfig }),
        }),
};
