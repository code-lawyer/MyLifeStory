import { it, expect, vi, beforeEach } from 'vitest';
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

it('shows RefineDialog when 细化 button is clicked', async () => {
  vi.spyOn(charsApiModule.charactersApi, 'generateDraft').mockResolvedValue({ draft: mockCharDraft });
  renderPage();
  await userEvent.type(screen.getByPlaceholderText(/描述这个角色的概念/), '一个机械师');
  await userEvent.click(screen.getByRole('button', { name: /生成角色/ }));
  await waitFor(() => screen.getByText('基本身份'));

  const refineButtons = screen.getAllByRole('button', { name: '细化' });
  await userEvent.click(refineButtons[0]);
  expect(screen.getByText(/细化：/)).toBeInTheDocument();
});

it('calls refineDraft and closes dialog after confirming', async () => {
  const refinedDraft = { ...mockCharDraft, identity: { ...mockCharDraft.identity, background: '改良后背景' } };
  vi.spyOn(charsApiModule.charactersApi, 'generateDraft').mockResolvedValue({ draft: mockCharDraft });
  vi.spyOn(charsApiModule.charactersApi, 'refineDraft').mockResolvedValue({ draft: refinedDraft });

  renderPage();
  await userEvent.type(screen.getByPlaceholderText(/描述这个角色的概念/), '一个机械师');
  await userEvent.click(screen.getByRole('button', { name: /生成角色/ }));
  await waitFor(() => screen.getByText('基本身份'));

  const refineButtons = screen.getAllByRole('button', { name: '细化' });
  await userEvent.click(refineButtons[0]);

  const dialogTextarea = screen.getByPlaceholderText(/例如/);
  await userEvent.type(dialogTextarea, '更坚韧一些');
  await userEvent.click(screen.getByRole('button', { name: '确认细化' }));

  await waitFor(() =>
    expect(charsApiModule.charactersApi.refineDraft).toHaveBeenCalledWith(
      mockCharDraft, 'identity', '更坚韧一些', expect.any(Object)
    )
  );
});

it('calls charactersApi.create on confirm and navigates', async () => {
  vi.spyOn(charsApiModule.charactersApi, 'generateDraft').mockResolvedValue({ draft: mockCharDraft });
  vi.spyOn(charsApiModule.charactersApi, 'create').mockResolvedValue({ ...mockCharDraft });

  renderPage();
  await userEvent.type(screen.getByPlaceholderText(/描述这个角色的概念/), '一个机械师');
  await userEvent.click(screen.getByRole('button', { name: /生成角色/ }));
  await waitFor(() => screen.getByText('确认创建'));

  await userEvent.click(screen.getByRole('button', { name: /确认创建/ }));
  await waitFor(() => expect(charsApiModule.charactersApi.create).toHaveBeenCalledTimes(1));
});
