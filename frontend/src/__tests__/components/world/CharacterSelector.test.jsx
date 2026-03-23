import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CharacterSelector from '../../../components/world/CharacterSelector.jsx';

const chars = [
  { id: 'c1', name: '艾拉', tier: 'legendary' },
  { id: 'c2', name: '雷克斯', tier: 'elite' },
];

it('renders a button for each character', () => {
  render(<CharacterSelector characters={chars} selectedId="c1" onSelect={vi.fn()} />);
  expect(screen.getByRole('button', { name: /艾拉/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /雷克斯/ })).toBeInTheDocument();
});

it('calls onSelect with character id when clicking', async () => {
  const onSelect = vi.fn();
  render(<CharacterSelector characters={chars} selectedId="c1" onSelect={onSelect} />);
  await userEvent.click(screen.getByRole('button', { name: /雷克斯/ }));
  expect(onSelect).toHaveBeenCalledWith('c2');
});

it('deselects character when clicking the selected one', async () => {
  const onSelect = vi.fn();
  render(<CharacterSelector characters={chars} selectedId="c1" onSelect={onSelect} />);
  await userEvent.click(screen.getByRole('button', { name: /艾拉/ }));
  expect(onSelect).toHaveBeenCalledWith(null);
});

it('shows empty state when characters array is empty', () => {
  render(<CharacterSelector characters={[]} selectedId={null} onSelect={vi.fn()} />);
  expect(screen.getByText('当前场景无角色')).toBeInTheDocument();
});

it('shows tier badges for legendary and elite characters', () => {
  render(<CharacterSelector characters={chars} selectedId={null} onSelect={vi.fn()} />);
  expect(screen.getByText('★')).toBeInTheDocument();
  expect(screen.getByText('◆')).toBeInTheDocument();
});
