import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scenesApi } from '../../api/scenes.js';

beforeEach(() => { vi.restoreAllMocks(); });

it('list fetches GET /scenes/:worldId', async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ scenes: [] }) });
  const result = await scenesApi.list('w1');
  expect(result.scenes).toEqual([]);
});

it('enterScene POSTs /scenes/:worldId/:sceneId/enter', async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ scene: {} }) });
  await scenesApi.enterScene('w1', 's1');
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/world-sim/scenes/w1/s1/enter',
    expect.objectContaining({ method: 'POST' })
  );
});
