import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from '../../pages/SettingsPage.jsx';
import { useSettingsStore } from '../../stores/settingsStore.js';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({
    apiUrl: '', apiKey: '', model: '', tokenBudget: 4096,
  });
  vi.restoreAllMocks();
});

function renderPage() {
  return render(<MemoryRouter><SettingsPage /></MemoryRouter>);
}

it('renders all four input fields', () => {
  renderPage();
  expect(screen.getByLabelText(/API URL/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/模型/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Token 预算/i)).toBeInTheDocument();
});

it('saves settings to store and localStorage on submit', async () => {
  renderPage();
  await userEvent.clear(screen.getByLabelText(/API URL/i));
  await userEvent.type(screen.getByLabelText(/API URL/i), 'https://api.example.com/v1');
  await userEvent.clear(screen.getByLabelText(/API Key/i));
  await userEvent.type(screen.getByLabelText(/API Key/i), 'sk-test');
  await userEvent.clear(screen.getByLabelText(/模型/i));
  await userEvent.type(screen.getByLabelText(/模型/i), 'gpt-4o');
  await userEvent.click(screen.getByRole('button', { name: /保存/ }));
  expect(useSettingsStore.getState().apiUrl).toBe('https://api.example.com/v1');
  expect(useSettingsStore.getState().apiKey).toBe('sk-test');
  expect(useSettingsStore.getState().model).toBe('gpt-4o');
  expect(JSON.parse(localStorage.getItem('world-sim-settings')).apiKey).toBe('sk-test');
});

it('shows saved confirmation after submit', async () => {
  renderPage();
  await userEvent.click(screen.getByRole('button', { name: /保存/ }));
  expect(await screen.findByText(/已保存/)).toBeInTheDocument();
});

it('loads existing settings from localStorage on mount', () => {
  localStorage.setItem('world-sim-settings', JSON.stringify({
    apiUrl: 'https://existing.api', apiKey: 'sk-existing', model: 'claude-3', tokenBudget: 8192,
  }));
  useSettingsStore.setState({ apiUrl: 'https://existing.api', apiKey: 'sk-existing', model: 'claude-3', tokenBudget: 8192 });
  renderPage();
  expect(screen.getByLabelText(/API URL/i)).toHaveValue('https://existing.api');
});
