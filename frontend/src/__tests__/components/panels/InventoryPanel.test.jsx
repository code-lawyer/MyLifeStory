import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InventoryPanel from '../../../components/panels/InventoryPanel.jsx';
import * as playerApiModule from '../../../api/player.js';

const mockPlayer = {
  name: 'Hero',
  inventory: [
    { id: 'i1', name: 'Sword of Dawn', description: 'A gleaming blade', source_event: 'Battle of Iron Keep' },
  ],
};

beforeEach(() => { vi.restoreAllMocks(); });

it('lists inventory items', async () => {
  vi.spyOn(playerApiModule.playerApi, 'get').mockResolvedValue(mockPlayer);
  render(<InventoryPanel worldId="w1" onClose={vi.fn()} />);
  await waitFor(() => expect(screen.getByText('Sword of Dawn')).toBeInTheDocument());
  expect(screen.getByText('Battle of Iron Keep')).toBeInTheDocument();
});

it('calls deleteItem when clicking delete and removes item from list', async () => {
  vi.spyOn(playerApiModule.playerApi, 'get').mockResolvedValue(mockPlayer);
  vi.spyOn(playerApiModule.playerApi, 'deleteItem').mockResolvedValue({});
  render(<InventoryPanel worldId="w1" onClose={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: /删除/ }));
  await waitFor(() =>
    expect(playerApiModule.playerApi.deleteItem).toHaveBeenCalledWith('w1', 'i1')
  );
});
