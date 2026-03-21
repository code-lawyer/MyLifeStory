import { apiFetch } from './client.js';

const BASE = (worldId) => `/api/world-sim/scenes/${worldId}`;

export const scenesApi = {
    list: (worldId) => apiFetch(BASE(worldId)),
    enterScene: (worldId, sceneId) =>
        apiFetch(`${BASE(worldId)}/${sceneId}/enter`, { method: 'POST', body: JSON.stringify({}) }),
};
