import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eventsApi } from '../../api/events.js';

beforeEach(() => { vi.restoreAllMocks(); });

it('confirmEvent POSTs /events/:worldId', async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  await eventsApi.confirm('w1', { id: 'e1', title: 'Battle' });
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/world-sim/events/w1',
    expect.objectContaining({ method: 'POST' })
  );
});

it('proposeEvent POSTs /events/:worldId/propose', async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ proposal: null }) });
  const result = await eventsApi.propose('w1', [], {});
  expect(result.proposal).toBeNull();
});
