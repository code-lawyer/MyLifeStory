import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MapPanel from '../../../components/panels/MapPanel.jsx';
import * as scenesApiModule from '../../../api/scenes.js';

const mockScenes = [
  { id: 's1', name: 'Capital', is_locked: false },
  { id: 's2', name: 'Forbidden City', is_locked: true, unlock_condition: 'Reach level 5' },
];

beforeEach(() => { vi.restoreAllMocks(); });

it('lists scenes', () => {
  render(<MapPanel worldId="w1" scenes={mockScenes} onClose={vi.fn()} />);
  expect(screen.getByText('Capital')).toBeInTheDocument();
  expect(screen.getByText('Forbidden City')).toBeInTheDocument();
});

it('shows unlock condition as title on locked scene button', () => {
  render(<MapPanel worldId="w1" scenes={[mockScenes[1]]} onClose={vi.fn()} />);
  expect(screen.getByTitle('Reach level 5')).toBeInTheDocument();
});

it('calls enterScene and onClose when clicking an unlocked scene', async () => {
  vi.spyOn(scenesApiModule.scenesApi, 'enterScene').mockResolvedValue({ scene: {} });
  const onClose = vi.fn();
  render(<MapPanel worldId="w1" scenes={[mockScenes[0]]} onClose={onClose} />);
  await userEvent.click(screen.getByText('Capital'));
  await waitFor(() => expect(scenesApiModule.scenesApi.enterScene).toHaveBeenCalledWith('w1', 's1'));
  expect(onClose).toHaveBeenCalled();
});

it('calls onEnter with API response when entering a scene', async () => {
  const apiResult = { scene: { id: 's1', name: 'Capital', description: 'The capital city' }, characters_present: ['c1'] };
  vi.spyOn(scenesApiModule.scenesApi, 'enterScene').mockResolvedValue(apiResult);
  const onEnter = vi.fn();
  const onClose = vi.fn();
  render(<MapPanel worldId="w1" scenes={mockScenes} onClose={onClose} onEnter={onEnter} />);
  await userEvent.click(screen.getByText('Capital'));
  await waitFor(() => expect(onEnter).toHaveBeenCalledWith(apiResult));
  expect(onClose).toHaveBeenCalled();
});
