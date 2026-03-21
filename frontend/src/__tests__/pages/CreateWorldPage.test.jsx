import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CreateWorldPage from '../../pages/CreateWorldPage.jsx';
import * as worldsApiModule from '../../api/worlds.js';

const mockDraft = {
  id: 'world_test',
  name: '铁雾城邦',
  foundation: { background: '工业蒸汽城市', geography: '北方高原', rules: '机械法则' },
  power_system: { description: '工程师阶层', tiers: [], constraints: '无', notes: '' },
  current_state: { summary: '动荡时期', key_tensions: [], recent_changes: '' },
};

beforeEach(() => { vi.restoreAllMocks(); });

function renderPage() {
  return render(<MemoryRouter><CreateWorldPage /></MemoryRouter>);
}

it('shows description textarea and generate button initially', () => {
  renderPage();
  expect(screen.getByPlaceholderText(/描述你想要的世界/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /生成世界/ })).toBeInTheDocument();
});

it('shows draft sections after generation', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'generateDraft').mockResolvedValue({ draft: mockDraft });
  renderPage();
  await userEvent.type(screen.getByPlaceholderText(/描述你想要的世界/), '一个工业蒸汽城市');
  await userEvent.click(screen.getByRole('button', { name: /生成世界/ }));
  await waitFor(() => expect(screen.getByText('基础设定')).toBeInTheDocument());
  expect(screen.getByText('力量体系')).toBeInTheDocument();
  expect(screen.getByText('当前状态')).toBeInTheDocument();
});

it('shows RefineDialog when Refine button is clicked', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'generateDraft').mockResolvedValue({ draft: mockDraft });
  renderPage();
  await userEvent.type(screen.getByPlaceholderText(/描述你想要的世界/), '一个工业城市');
  await userEvent.click(screen.getByRole('button', { name: /生成世界/ }));
  await waitFor(() => screen.getByText('基础设定'));

  const refineButtons = screen.getAllByRole('button', { name: '细化' });
  await userEvent.click(refineButtons[0]);
  expect(screen.getByText(/细化：/)).toBeInTheDocument();
});

it('shows error alert on 502', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'generateDraft').mockRejectedValue({ status: 502, message: 'llm_unavailable' });
  renderPage();
  await userEvent.type(screen.getByPlaceholderText(/描述你想要的世界/), '描述');
  await userEvent.click(screen.getByRole('button', { name: /生成世界/ }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(screen.getByText(/AI 服务暂时不可用/)).toBeInTheDocument();
});
