import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import WorldListPage from '../../pages/WorldListPage.jsx';
import * as worldsApiModule from '../../api/worlds.js';

beforeEach(() => { vi.restoreAllMocks(); });

function renderPage() {
  return render(<MemoryRouter><WorldListPage /></MemoryRouter>);
}

it('shows loading then list of worlds', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'list').mockResolvedValue([
    { id: 'w1', name: 'Iron Fog', foundation: { background: 'A dark city' } },
  ]);
  renderPage();
  expect(screen.getByRole('status')).toBeInTheDocument(); // spinner
  await waitFor(() => expect(screen.getByText('Iron Fog')).toBeInTheDocument());
});

it('shows empty state when no worlds', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'list').mockResolvedValue([]);
  renderPage();
  await waitFor(() => expect(screen.getByText(/还没有世界/)).toBeInTheDocument());
});

it('shows error message on API failure', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'list').mockRejectedValue(new Error('network error'));
  renderPage();
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
});

it('navigates to /create/world when clicking the create button', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'list').mockResolvedValue([]);
  renderPage();
  const link = await screen.findByRole('link', { name: /创建新世界/ });
  expect(link.getAttribute('href')).toBe('/create/world');
});
