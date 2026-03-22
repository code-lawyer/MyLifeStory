import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EventProposalCard from '../../../components/chat/EventProposalCard.jsx';
import * as eventsApiModule from '../../../api/events.js';

const mockProposal = {
  narrative: '冥冥中，一场风暴正在酝酿。',
  event_draft: { id: 'e1', title: 'Great Storm', description: 'A storm', impact_scope: 'major', affected_characters: [] },
};

beforeEach(() => { vi.restoreAllMocks(); });

it('displays narrative text from proposal', () => {
  render(<EventProposalCard worldId="w1" proposal={mockProposal} onDismiss={vi.fn()} />);
  expect(screen.getByText('冥冥中，一场风暴正在酝酿。')).toBeInTheDocument();
});

it('calls eventsApi.confirm then onDismiss when accepting', async () => {
  vi.spyOn(eventsApiModule.eventsApi, 'confirm').mockResolvedValue({});
  const onDismiss = vi.fn();
  render(<EventProposalCard worldId="w1" proposal={mockProposal} onDismiss={onDismiss} />);
  await userEvent.click(screen.getByRole('button', { name: /接受/ }));
  await waitFor(() => expect(eventsApiModule.eventsApi.confirm).toHaveBeenCalledWith('w1', mockProposal.event_draft));
  await waitFor(() => expect(onDismiss).toHaveBeenCalled());
});

it('calls onDismiss immediately when ignoring', async () => {
  const onDismiss = vi.fn();
  render(<EventProposalCard worldId="w1" proposal={mockProposal} onDismiss={onDismiss} />);
  await userEvent.click(screen.getByRole('button', { name: /忽略/ }));
  expect(onDismiss).toHaveBeenCalled();
});

it('disables buttons while accepting', async () => {
  let resolve;
  vi.spyOn(eventsApiModule.eventsApi, 'confirm').mockImplementation(
    () => new Promise((r) => { resolve = r; })
  );
  render(<EventProposalCard worldId="w1" proposal={mockProposal} onDismiss={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /接受/ }));
  expect(screen.getByRole('button', { name: /接受/ })).toBeDisabled();
  resolve({});
});
