import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ChatPane from '../../../components/chat/ChatPane.jsx';
import * as chatApiModule from '../../../api/chat.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPane(props = {}) {
  return render(
    <MemoryRouter>
      <ChatPane worldId="w1" worldData={{}} playerStatus={{}} narrativeMode="ensemble" {...props} />
    </MemoryRouter>
  );
}

it('shows empty message list initially', () => {
  renderPane();
  expect(screen.queryByRole('list')).toBeInTheDocument();
  // no messages yet
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);
});

it('sends a message and appends it to the list', async () => {
  vi.spyOn(chatApiModule, 'buildContext').mockResolvedValue({
    systemPrompt: 'sys', trimmedChatHistory: [], mode: 'ensemble',
  });
  vi.spyOn(chatApiModule, 'streamChat').mockImplementation(async ({ onDelta, onDone }) => {
    onDelta('The world trembles.');
    onDone();
  });
  renderPane();
  await userEvent.type(screen.getByRole('textbox'), 'What happens?');
  await userEvent.click(screen.getByRole('button', { name: /发送/ }));
  await waitFor(() => expect(screen.getByText('What happens?')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText(/The world trembles/)).toBeInTheDocument());
});

it('disables send button while streaming', async () => {
  let resolveDone;
  vi.spyOn(chatApiModule, 'buildContext').mockResolvedValue({
    systemPrompt: 'sys', trimmedChatHistory: [], mode: 'ensemble',
  });
  vi.spyOn(chatApiModule, 'streamChat').mockImplementation(async ({ onDone }) => {
    await new Promise((res) => { resolveDone = res; });
    onDone();
  });
  renderPane();
  await userEvent.type(screen.getByRole('textbox'), 'hi');
  await userEvent.click(screen.getByRole('button', { name: /发送/ }));
  expect(screen.getByRole('button', { name: /发送/ })).toBeDisabled();
  resolveDone();
  await waitFor(() => expect(screen.getByRole('button', { name: /发送/ })).not.toBeDisabled());
});

it('calls onTurnComplete after AI reply finishes', async () => {
  vi.spyOn(chatApiModule, 'buildContext').mockResolvedValue({
    systemPrompt: 'sys', trimmedChatHistory: [], mode: 'ensemble',
  });
  vi.spyOn(chatApiModule, 'streamChat').mockImplementation(async ({ onDelta, onDone }) => {
    onDelta('ok'); onDone();
  });
  const onTurnComplete = vi.fn();
  renderPane({ onTurnComplete });
  await userEvent.type(screen.getByRole('textbox'), 'hi');
  await userEvent.click(screen.getByRole('button', { name: /发送/ }));
  await waitFor(() => expect(onTurnComplete).toHaveBeenCalledTimes(1));
});

it('clears input after sending', async () => {
  vi.spyOn(chatApiModule, 'buildContext').mockResolvedValue({
    systemPrompt: 'sys', trimmedChatHistory: [], mode: 'ensemble',
  });
  vi.spyOn(chatApiModule, 'streamChat').mockImplementation(async ({ onDone }) => { onDone(); });
  renderPane();
  await userEvent.type(screen.getByRole('textbox'), 'hello');
  await userEvent.click(screen.getByRole('button', { name: /发送/ }));
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
});
