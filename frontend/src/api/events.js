import { apiFetch } from './client.js';

const BASE = (worldId) => `/api/world-sim/events/${worldId}`;

export const eventsApi = {
    list: (worldId) => apiFetch(BASE(worldId)),
    confirm: (worldId, event) =>
        apiFetch(BASE(worldId), { method: 'POST', body: JSON.stringify(event) }),
    delete: (worldId, eventId) =>
        apiFetch(`${BASE(worldId)}/${eventId}`, { method: 'DELETE' }),
    propose: (worldId, chatHistory, apiConfig) =>
        apiFetch(`${BASE(worldId)}/propose`, {
            method: 'POST',
            body: JSON.stringify({ chatHistory, apiConfig }),
        }),
};
