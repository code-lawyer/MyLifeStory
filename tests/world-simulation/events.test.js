import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { router } from '../../src/endpoints/world-simulation/index.js';
import { startTestServer } from './helpers.js';

let server;

beforeAll(async () => { server = await startTestServer(router); });
afterAll(async () => { await server.stop(); });

describe('GET /health', () => {
    test('returns ok', async () => {
        const res = await fetch(`${server.url}/health`);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.ok).toBe(true);
    });
});
