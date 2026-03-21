import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreateCharacterPage from '../../pages/CreateCharacterPage.jsx';
import * as charsApiModule from '../../api/characters.js';

const mockCharDraft = {
  id: 'char_test',
  name: '艾达·沃克',
  world_id: 'w1',
  identity: { background: '机械师', role: '反抗军工程师', personality: '坚韧' },
  power_tier: { level: 2, name: '技师', notes: '擅长机械' },
  current_state: { location: 'scene_001', goal: '推翻压迫', secrets: '前贵族' },
};

beforeEach(() => { vi.restoreAllMocks(); });

function renderPage(worldId = 'w1') {
  return render(
    <MemoryRouter initialEntries={[`/create/character?worldId=${worldId}`]}>
      <Routes>
        <Route path="/create/character" element={<CreateCharacterPage />} />
      </Routes>
    </MemoryRouter>
  );
}

it('shows description textarea and generate button', () => {
  renderPage();
  expect(screen.getByPlaceholderText(/描述这个角色的概念/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /生成角色/ })).toBeInTheDocument();
});

it('shows draft sections after generation', async () => {
  vi.spyOn(charsApiModule.charactersApi, 'generateDraft').mockResolvedValue({ draft: mockCharDraft });
  renderPage();
  await userEvent.type(screen.getByPlaceholderText(/描述这个角色的概念/), '一个坚韧的女机械师');
  await userEvent.click(screen.getByRole('button', { name: /生成角色/ }));
  await waitFor(() => expect(screen.getByText('基本身份')).toBeInTheDocument());
  expect(screen.getByText('力量等级')).toBeInTheDocument();
  expect(screen.getByText('当前状态')).toBeInTheDocument();
});

it('shows error alert on 502', async () => {
  vi.spyOn(charsApiModule.charactersApi, 'generateDraft').mockRejectedValue({ status: 502 });
  renderPage();
  await userEvent.type(screen.getByPlaceholderText(/描述这个角色的概念/), '一个角色');
  await userEvent.click(screen.getByRole('button', { name: /生成角色/ }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(screen.getByText(/AI 服务暂时不可用/)).toBeInTheDocument();
});
