import { describe, test, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { startTestServer } from './helpers.js';
import { setLLMAdapter } from '../../src/endpoints/world-simulation/llm-client.js';

let server, tmpDir, dirs;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ws-rels-'));
  dirs = { relationships: path.join(tmpDir, 'relationships') };
  fs.mkdirSync(dirs.relationships, { recursive: true });
  const { router } = await import('../../src/endpoints/world-simulation/relationships.js');
  server = await startTestServer(router, dirs);
});

afterEach(async () => {
  await server.stop();
  await rm(tmpDir, { recursive: true });
  setLLMAdapter(null);
});

describe('POST /:worldId/event-drift', () => {
  test('returns 400 when affectedCharIds is missing', async () => {
    const res = await fetch(`${server.url}/world_001/event-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: { title: 'Test' } }), // missing affectedCharIds
    });
    expect(res.status).toBe(400);
  });

  test('returns 400 when affectedCharIds is empty array', async () => {
    const res = await fetch(`${server.url}/world_001/event-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: { title: 'Test' }, affectedCharIds: [] }),
    });
    expect(res.status).toBe(400);
  });

  test('returns { updated: [] } when no valid char IDs survive filtering', async () => {
    const res = await fetch(`${server.url}/world_001/event-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: { title: 'Fight', description: 'A brawl', impact_scope: 'moderate' },
        affectedCharIds: ['__player__', '../evil', ''],
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: [] });
  });

  test('applies LLM delta and persists updated familiarity', async () => {
    // Seed familiarity at 50
    const relPath = path.join(dirs.relationships, 'rel_world_001.json');
    fs.writeFileSync(relPath, JSON.stringify({
      relationships: { char_001: { familiarity: 50, last_interaction: '2026-01-01T00:00:00.000Z' } }
    }));

    setLLMAdapter(async () => JSON.stringify({ delta: 3 }));

    const res = await fetch(`${server.url}/world_001/event-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: { title: 'Rescued', description: 'Player saved char', impact_scope: 'moderate' },
        affectedCharIds: ['char_001'],
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.updated).toHaveLength(1);
    expect(data.updated[0]).toMatchObject({ charId: 'char_001', familiarity: 53, delta: 3 });

    // Verify persisted to disk
    const persisted = JSON.parse(fs.readFileSync(relPath, 'utf8'));
    expect(persisted.relationships.char_001.familiarity).toBe(53);
  });

  test('clamps familiarity to 100 when delta would exceed maximum', async () => {
    const relPath = path.join(dirs.relationships, 'rel_world_002.json');
    fs.writeFileSync(relPath, JSON.stringify({
      relationships: { char_002: { familiarity: 98 } }
    }));

    setLLMAdapter(async () => JSON.stringify({ delta: 5 }));

    const res = await fetch(`${server.url}/world_002/event-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: { title: 'Bond', description: 'Deep trust established', impact_scope: 'major' },
        affectedCharIds: ['char_002'],
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.updated[0].familiarity).toBe(100);
  });

  test('clamps familiarity to 0 when delta would go below minimum', async () => {
    const relPath = path.join(dirs.relationships, 'rel_world_003.json');
    fs.writeFileSync(relPath, JSON.stringify({
      relationships: { char_003: { familiarity: 2 } }
    }));

    setLLMAdapter(async () => JSON.stringify({ delta: -5 }));

    const res = await fetch(`${server.url}/world_003/event-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: { title: 'Betrayal', description: 'Trust broken', impact_scope: 'major' },
        affectedCharIds: ['char_003'],
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.updated[0].familiarity).toBe(0);
  });

  test('skips char gracefully when LLM fails, does not write file', async () => {
    const relPath = path.join(dirs.relationships, 'rel_world_004.json');
    const original = { relationships: { char_004: { familiarity: 40 } } };
    fs.writeFileSync(relPath, JSON.stringify(original));

    setLLMAdapter(async () => { throw new Error('LLM unavailable'); });

    const res = await fetch(`${server.url}/world_004/event-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: { title: 'Fight', description: 'Clash', impact_scope: 'minor' },
        affectedCharIds: ['char_004'],
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: [] });

    // File unchanged
    const persisted = JSON.parse(fs.readFileSync(relPath, 'utf8'));
    expect(persisted.relationships.char_004.familiarity).toBe(40);
  });
});
