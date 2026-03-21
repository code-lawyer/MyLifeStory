import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MapPanel from '../../../components/panels/MapPanel.jsx';
import * as scenesApiModule from '../../../api/scenes.js';

beforeEach(() => { vi.restoreAllMocks(); });

it('lists scenes after loading', async () => {
  vi.spyOn(scenesApiModule.scenesApi, 'list').mockResolvedValue({
    scenes: [
      { id: 's1', name: 'Capital', is_locked: false },
      { id: 's2', name: 'Forbidden City', is_locked: true, unlock_condition: 'Reach level 5' },
    ],
  });
  render(<MapPanel worldId="w1" onClose={vi.fn()} />);
  await waitFor(() => expect(screen.getByText('Capital')).toBeInTheDocument());
  expect(screen.getByText('Forbidden City')).toBeInTheDocument();
});

it('shows unlock condition as title on locked scene button', async () => {
  vi.spyOn(scenesApiModule.scenesApi, 'list').mockResolvedValue({
    scenes: [{ id: 's2', name: 'Forbidden City', is_locked: true, unlock_condition: 'Reach level 5' }],
  });
  render(<MapPanel worldId="w1" onClose={vi.fn()} />);
  await waitFor(() => screen.getByText('Forbidden City'));
  expect(screen.getByTitle('Reach level 5')).toBeInTheDocument();
});

it('calls enterScene and onClose when clicking an unlocked scene', async () => {
  vi.spyOn(scenesApiModule.scenesApi, 'list').mockResolvedValue({
    scenes: [{ id: 's1', name: 'Capital', is_locked: false }],
  });
  vi.spyOn(scenesApiModule.scenesApi, 'enterScene').mockResolvedValue({ scene: {} });
  const onClose = vi.fn();
  render(<MapPanel worldId="w1" onClose={onClose} />);
  await userEvent.click(await screen.findByText('Capital'));
  await waitFor(() => expect(scenesApiModule.scenesApi.enterScene).toHaveBeenCalledWith('w1', 's1'));
  expect(onClose).toHaveBeenCalled();
});
