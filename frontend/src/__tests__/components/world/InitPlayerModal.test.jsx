import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InitPlayerModal from '../../../components/world/InitPlayerModal.jsx';
import * as playerApiModule from '../../../api/player.js';

beforeEach(() => { vi.restoreAllMocks(); });

it('renders name input and submit button', () => {
  render(<InitPlayerModal worldId="w1" onCreated={vi.fn()} />);
  expect(screen.getByLabelText(/角色名/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /开始冒险/ })).toBeInTheDocument();
});

it('calls playerApi.create and onCreated on submit', async () => {
  const mockPlayer = { id: 'p1', name: 'Hero', status: {}, inventory: [] };
  vi.spyOn(playerApiModule.playerApi, 'create').mockResolvedValue(mockPlayer);
  const onCreated = vi.fn();
  render(<InitPlayerModal worldId="w1" onCreated={onCreated} />);
  await userEvent.type(screen.getByLabelText(/角色名/i), 'Hero');
  await userEvent.click(screen.getByRole('button', { name: /开始冒险/ }));
  expect(playerApiModule.playerApi.create).toHaveBeenCalledWith('w1', expect.objectContaining({ name: 'Hero' }));
  await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(mockPlayer));
});

it('disables button while submitting', async () => {
  let resolve;
  vi.spyOn(playerApiModule.playerApi, 'create').mockReturnValue(new Promise(r => { resolve = r; }));
  render(<InitPlayerModal worldId="w1" onCreated={vi.fn()} />);
  await userEvent.type(screen.getByLabelText(/角色名/i), 'Hero');
  await userEvent.click(screen.getByRole('button', { name: /开始冒险/ }));
  expect(screen.getByRole('button', { name: /开始冒险/ })).toBeDisabled();
  resolve({ id: 'p1', name: 'Hero', status: {}, inventory: [] });
});

it('shows error message when create fails', async () => {
  vi.spyOn(playerApiModule.playerApi, 'create').mockRejectedValue(new Error('fail'));
  render(<InitPlayerModal worldId="w1" onCreated={vi.fn()} />);
  await userEvent.type(screen.getByLabelText(/角色名/i), 'Hero');
  await userEvent.click(screen.getByRole('button', { name: /开始冒险/ }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
});

it('re-enables button after create fails', async () => {
  vi.spyOn(playerApiModule.playerApi, 'create').mockRejectedValue(new Error('fail'));
  render(<InitPlayerModal worldId="w1" onCreated={vi.fn()} />);
  await userEvent.type(screen.getByLabelText(/角色名/i), 'Hero');
  await userEvent.click(screen.getByRole('button', { name: /开始冒险/ }));
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: /开始冒险/ })).not.toBeDisabled();
});
