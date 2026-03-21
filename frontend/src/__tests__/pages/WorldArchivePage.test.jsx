import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WorldArchivePage from '../../pages/WorldArchivePage.jsx';
import * as worldsApiModule from '../../api/worlds.js';
import * as eventsApiModule from '../../api/events.js';
import * as charactersApiModule from '../../api/characters.js';
import * as scenesApiModule from '../../api/scenes.js';

const mockWorld = {
  id: 'w1', name: 'Iron Fog',
  foundation: { background: 'A dark city' },
  power_system: { description: 'Cultivation levels' },
  current_state: { summary: 'The fog thickens.' },
};

beforeEach(() => { vi.restoreAllMocks(); });

function renderPage() {
  vi.spyOn(worldsApiModule.worldsApi, 'get').mockResolvedValue(mockWorld);
  vi.spyOn(eventsApiModule.eventsApi, 'list').mockResolvedValue({
    events: [{ id: 'e1', title: 'The Siege', description: 'City under attack', impact_scope: 'major' }],
  });
  vi.spyOn(charactersApiModule.charactersApi, 'list').mockResolvedValue([
    { id: 'c1', name: 'Ada', world_id: 'w1' },
  ]);
  vi.spyOn(scenesApiModule.scenesApi, 'list').mockResolvedValue({
    scenes: [{ id: 's1', name: 'Capital' }],
  });
  return render(
    <MemoryRouter initialEntries={['/world/w1/archive']}>
      <Routes>
        <Route path="/world/:worldId/archive" element={<WorldArchivePage />} />
      </Routes>
    </MemoryRouter>
  );
}

it('shows world name and current state summary', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Iron Fog')).toBeInTheDocument());
  expect(screen.getByText('The fog thickens.')).toBeInTheDocument();
});

it('lists events in timeline', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('The Siege')).toBeInTheDocument());
});

it('deletes an event when clicking delete and removes from list', async () => {
  vi.spyOn(eventsApiModule.eventsApi, 'delete').mockResolvedValue({});
  renderPage();
  await waitFor(() => screen.getByText('The Siege'));
  await userEvent.click(screen.getByRole('button', { name: /删除事件/ }));
  await waitFor(() => expect(eventsApiModule.eventsApi.delete).toHaveBeenCalledWith('w1', 'e1'));
  expect(screen.queryByText('The Siege')).not.toBeInTheDocument();
});

it('lists characters', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument());
});

it('lists scenes', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Capital')).toBeInTheDocument());
});
