import { it, expect, vi, beforeEach } from 'vitest';
import { stateApi } from '../../api/state.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

it('get fetches world state', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ current_state: { summary: 'ok' }, event_count: 5, summaries: [] }),
  });
  const result = await stateApi.get('w1');
  expect(result.current_state.summary).toBe('ok');
  expect(fetch).toHaveBeenCalledWith('/api/world-sim/state/w1', expect.objectContaining({ headers: {} }));
});

it('update posts apiConfig and returns new state', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ current_state: { summary: 'updated' } }),
  });
  const result = await stateApi.update('w1', { apiUrl: 'http://x', apiKey: 'k', model: 'm' });
  expect(result.current_state.summary).toBe('updated');
  expect(fetch).toHaveBeenCalledWith(
    '/api/world-sim/state/w1/update',
    expect.objectContaining({ method: 'POST' })
  );
});
