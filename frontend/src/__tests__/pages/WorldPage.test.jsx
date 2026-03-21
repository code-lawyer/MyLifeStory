import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WorldPage from '../../pages/WorldPage.jsx';
import * as worldsApiModule from '../../api/worlds.js';
import * as playerApiModule from '../../api/player.js';
import * as eventsApiModule from '../../api/events.js';
import * as chatApiModule from '../../api/chat.js';
import { useEventStore } from '../../stores/eventStore.js';
import { useChatStore } from '../../stores/chatStore.js';

const mockWorld = {
  id: 'w1', name: 'Iron Fog',
  foundation: { background: 'A dark city' },
  current_state: { summary: 'All is well' },
};
const mockPlayer = {
  name: 'Hero', status: { health: 100, mental: 80, reputation: 50 },
  inventory: [],
};

beforeEach(() => {
  vi.restoreAllMocks();
  // Reset Zustand event store so turn-counter tests are not order-dependent
  useEventStore.setState({ turnsSinceLastPropose: 0, pendingProposal: null, proposing: false });
  useChatStore.setState({ messages: [], streaming: false, currentWorldId: null });
});

function renderPage() {
  vi.spyOn(worldsApiModule.worldsApi, 'get').mockResolvedValue(mockWorld);
  vi.spyOn(playerApiModule.playerApi, 'get').mockResolvedValue(mockPlayer);
  vi.spyOn(eventsApiModule.eventsApi, 'list').mockResolvedValue({ events: [] });
  return render(
    <MemoryRouter initialEntries={['/world/w1']}>
      <Routes>
        <Route path="/world/:worldId" element={<WorldPage />} />
      </Routes>
    </MemoryRouter>
  );
}

it('shows world name in top bar after loading', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Iron Fog')).toBeInTheDocument());
});

it('renders narrative mode selector with ensemble as default', async () => {
  renderPage();
  await waitFor(() => screen.getByText('Iron Fog'));
  expect(screen.getByRole('combobox')).toHaveValue('ensemble');
});

it('shows map panel when clicking map button', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'get').mockResolvedValue(mockWorld);
  vi.spyOn(playerApiModule.playerApi, 'get').mockResolvedValue(mockPlayer);
  vi.spyOn(eventsApiModule.eventsApi, 'list').mockResolvedValue({ events: [] });
  // MapPanel also calls playerApi.get and scenesApi.list — mock both
  vi.spyOn(playerApiModule.playerApi, 'get').mockResolvedValue(mockPlayer);
  const { unmount } = render(
    <MemoryRouter initialEntries={['/world/w1']}>
      <Routes>
        <Route path="/world/:worldId" element={<WorldPage />} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => screen.getByText('Iron Fog'));
  await userEvent.click(screen.getByRole('button', { name: /地图/ }));
  expect(screen.getByText('地图')).toBeInTheDocument();
  unmount();
});

it('shows event proposal card after 3 turns complete', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'get').mockResolvedValue(mockWorld);
  vi.spyOn(playerApiModule.playerApi, 'get').mockResolvedValue(mockPlayer);
  vi.spyOn(eventsApiModule.eventsApi, 'list').mockResolvedValue({ events: [] });
  vi.spyOn(chatApiModule, 'buildContext').mockResolvedValue({
    systemPrompt: 'sys', trimmedChatHistory: [], mode: 'ensemble',
  });
  vi.spyOn(chatApiModule, 'streamChat').mockImplementation(async ({ onDelta, onDone }) => {
    onDelta('ok'); onDone();
  });
  vi.spyOn(eventsApiModule.eventsApi, 'propose').mockResolvedValue({
    proposal: {
      narrative: '冥冥中，风暴来临。',
      event_draft: { id: 'e1', title: 'Storm', description: 'A big storm', impact_scope: 'major', affected_characters: [] },
    },
  });

  render(
    <MemoryRouter initialEntries={['/world/w1']}>
      <Routes>
        <Route path="/world/:worldId" element={<WorldPage />} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => screen.getByText('Iron Fog'));

  const input = screen.getByRole('textbox');

  // Send 3 turns to trigger the propose cycle
  for (let i = 1; i <= 3; i++) {
    await userEvent.type(input, `Turn ${i}`);
    await userEvent.click(screen.getByRole('button', { name: /发送/ }));
    await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
  }

  await waitFor(
    () => expect(screen.getByText(/冥冥中，风暴来临。/)).toBeInTheDocument(),
    { timeout: 3000 }
  );
  expect(eventsApiModule.eventsApi.propose).toHaveBeenCalledWith(
    'w1',
    expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
    {}
  );
});
