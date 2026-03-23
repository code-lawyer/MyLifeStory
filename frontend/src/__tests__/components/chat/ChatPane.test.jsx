import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ChatPane from '../../../components/chat/ChatPane.jsx';
import * as chatApiModule from '../../../api/chat.js';
import { useChatStore } from '../../../stores/chatStore.js';

const CHAR_ID = 'char-001';
const characters = [{ id: CHAR_ID, name: 'Alice' }];

beforeEach(() => {
  vi.restoreAllMocks();
  useChatStore.setState({ blocks: [], streaming: false });
});

function renderPane(props = {}) {
  return render(
    <MemoryRouter>
      <ChatPane
        worldId="w1"
        worldData={{}}
        playerStatus={{}}
        narrativeMode="ensemble"
        characters={characters}
        activeCharacterId={CHAR_ID}
        {...props}
      />
    </MemoryRouter>
  );
}

it('shows empty message area initially', () => {
  renderPane();
  // no messages rendered yet
  expect(screen.queryByPlaceholderText('继续书写…')).toBeInTheDocument();
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
  // Wait for streaming to end (textarea becomes enabled), then type so button also enables
  await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
  await userEvent.type(screen.getByRole('textbox'), 'new input');
  expect(screen.getByRole('button', { name: /发送/ })).not.toBeDisabled();
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
