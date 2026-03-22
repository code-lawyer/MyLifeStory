import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlayerProfilePanel from '../../../components/panels/PlayerProfilePanel.jsx';
import * as playerApiModule from '../../../api/player.js';

const mockPlayer = {
  name: 'Hero', status: { health: 90, mental: 75, reputation: 60, current_location: 's1' },
};

beforeEach(() => { vi.restoreAllMocks(); });

it('shows player status fields', () => {
  render(<PlayerProfilePanel worldId="w1" player={mockPlayer} onClose={vi.fn()} />);
  expect(screen.getByText('Hero')).toBeInTheDocument();
  expect(screen.getByDisplayValue('90')).toBeInTheDocument();
});

it('calls updateStatus when saving changes', async () => {
  vi.spyOn(playerApiModule.playerApi, 'updateStatus').mockResolvedValue(mockPlayer);
  render(<PlayerProfilePanel worldId="w1" player={mockPlayer} onClose={vi.fn()} />);
  const healthInput = screen.getByDisplayValue('90');
  await userEvent.clear(healthInput);
  await userEvent.type(healthInput, '85');
  await userEvent.click(screen.getByRole('button', { name: /保存/ }));
  await waitFor(() =>
    expect(playerApiModule.playerApi.updateStatus).toHaveBeenCalledWith('w1', expect.objectContaining({ health: 85 }))
  );
});
