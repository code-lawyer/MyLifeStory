import { describe, it, expect, beforeEach } from 'vitest';
import { useWorldStore } from '../../stores/worldStore.js';

beforeEach(() => {
  useWorldStore.setState({ narrativeMode: 'ensemble' });
});

describe('worldStore', () => {
  it('setNarrativeMode updates mode', () => {
    useWorldStore.getState().setNarrativeMode('epic');
    expect(useWorldStore.getState().narrativeMode).toBe('epic');
  });
});
