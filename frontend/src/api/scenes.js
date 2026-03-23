import { apiFetch } from './client.js';

const BASE = (worldId) => `/api/world-sim/scenes/${worldId}`;

export const scenesApi = {
    list: (worldId) => apiFetch(BASE(worldId)),
    create: (worldId, scene) =>
        apiFetch(BASE(worldId), { method: 'POST', body: JSON.stringify(scene) }),
    enterScene: (worldId, sceneId) =>
        apiFetch(`${BASE(worldId)}/${sceneId}/enter`, { method: 'POST', body: JSON.stringify({}) }),
    delete: (worldId, sceneId) =>
        apiFetch(`${BASE(worldId)}/${sceneId}`, { method: 'DELETE' }),
};
