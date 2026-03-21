import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InitScenesModal from '../../../components/world/InitScenesModal.jsx';
import * as scenesApiModule from '../../../api/scenes.js';

beforeEach(() => { vi.restoreAllMocks(); });

it('renders scene name input and submit button', () => {
  render(<InitScenesModal worldId="w1" onCreated={vi.fn()} />);
  expect(screen.getByLabelText(/场景名/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /创建场景/ })).toBeInTheDocument();
});

it('calls scenesApi.create and onCreated on submit', async () => {
  const mockScene = { id: 's1', name: '起始酒馆', is_locked: false };
  vi.spyOn(scenesApiModule.scenesApi, 'create').mockResolvedValue(mockScene);
  const onCreated = vi.fn();
  render(<InitScenesModal worldId="w1" onCreated={onCreated} />);
  await userEvent.type(screen.getByLabelText(/场景名/i), '起始酒馆');
  await userEvent.click(screen.getByRole('button', { name: /创建场景/ }));
  expect(scenesApiModule.scenesApi.create).toHaveBeenCalledWith('w1', expect.objectContaining({ name: '起始酒馆' }));
  await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(mockScene));
});

it('shows error on create failure', async () => {
  vi.spyOn(scenesApiModule.scenesApi, 'create').mockRejectedValue(new Error('fail'));
  render(<InitScenesModal worldId="w1" onCreated={vi.fn()} />);
  await userEvent.type(screen.getByLabelText(/场景名/i), '酒馆');
  await userEvent.click(screen.getByRole('button', { name: /创建场景/ }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
});
