import { it, expect, vi, beforeEach } from 'vitest';
import { playerApi } from '../../api/player.js';

beforeEach(() => { vi.restoreAllMocks(); });

it('getPlayer fetches GET /player/:worldId', async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ name: 'Hero' }) });
  const result = await playerApi.get('w1');
  expect(result.name).toBe('Hero');
  expect(global.fetch).toHaveBeenCalledWith('/api/world-sim/player/w1', expect.any(Object));
});

it('updateStatus PATCHes /player/:worldId/status', async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ name: 'Hero' }) });
  await playerApi.updateStatus('w1', { health: 80 });
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/world-sim/player/w1/status',
    expect.objectContaining({ method: 'PATCH' })
  );
});

it('deleteItem DELETEs /player/:worldId/inventory/:itemId', async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  await playerApi.deleteItem('w1', 'item1');
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/world-sim/player/w1/inventory/item1',
    expect.objectContaining({ method: 'DELETE' })
  );
});
