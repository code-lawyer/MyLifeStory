import { describe, it, expect, beforeEach } from 'vitest';
import { useWorldStore } from '../../stores/worldStore.js';

beforeEach(() => {
  useWorldStore.setState({ worlds: [], currentWorld: null, narrativeMode: 'ensemble', loading: false, error: null });
});

describe('worldStore', () => {
  it('setWorlds updates the worlds list', () => {
    const { setWorlds } = useWorldStore.getState();
    setWorlds([{ id: 'w1', name: 'Iron Fog' }]);
    expect(useWorldStore.getState().worlds).toHaveLength(1);
  });

  it('setCurrentWorld updates currentWorld', () => {
    const world = { id: 'w1', name: 'Iron Fog' };
    useWorldStore.getState().setCurrentWorld(world);
    expect(useWorldStore.getState().currentWorld).toEqual(world);
  });

  it('setNarrativeMode updates mode', () => {
    useWorldStore.getState().setNarrativeMode('epic');
    expect(useWorldStore.getState().narrativeMode).toBe('epic');
  });
});
