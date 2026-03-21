import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CharacterSelector from '../../../components/world/CharacterSelector.jsx';

const chars = [
  { id: 'c1', name: '艾拉', identity: { description: 'A mage' } },
  { id: 'c2', name: '雷克斯', identity: { description: 'A warrior' } },
];

it('renders a checkbox for each character', () => {
  render(<CharacterSelector characters={chars} active={['c1']} onChange={vi.fn()} />);
  expect(screen.getByLabelText('艾拉')).toBeChecked();
  expect(screen.getByLabelText('雷克斯')).not.toBeChecked();
});

it('calls onChange with updated list when toggling', async () => {
  const onChange = vi.fn();
  render(<CharacterSelector characters={chars} active={['c1']} onChange={onChange} />);
  await userEvent.click(screen.getByLabelText('雷克斯'));
  expect(onChange).toHaveBeenCalledWith(['c1', 'c2']);
});

it('removes character when unchecking', async () => {
  const onChange = vi.fn();
  render(<CharacterSelector characters={chars} active={['c1', 'c2']} onChange={onChange} />);
  await userEvent.click(screen.getByLabelText('艾拉'));
  expect(onChange).toHaveBeenCalledWith(['c2']);
});

it('returns null when characters array is empty', () => {
  const { container } = render(<CharacterSelector characters={[]} active={[]} onChange={vi.fn()} />);
  expect(container.firstChild).toBeNull();
});
