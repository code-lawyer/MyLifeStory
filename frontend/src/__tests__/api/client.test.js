import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, ApiError } from '../../api/client.js';

beforeEach(() => { vi.restoreAllMocks(); });

describe('apiFetch', () => {
  it('returns parsed JSON on 200', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    const result = await apiFetch('/api/world-sim/health');
    expect(result).toEqual({ ok: true });
  });

  it('throws ApiError with status on 404', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'world_not_found' }),
    });
    await expect(apiFetch('/api/world-sim/worlds/bad')).rejects.toThrow(ApiError);
    await expect(apiFetch('/api/world-sim/worlds/bad')).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError with status 502 on LLM failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: 'llm_unavailable' }),
    });
    await expect(apiFetch('/api/world-sim/generate/world', { method: 'POST', body: '{}' }))
      .rejects.toMatchObject({ status: 502 });
  });
});
